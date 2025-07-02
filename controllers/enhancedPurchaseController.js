const asyncHandler = require('express-async-handler');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Inventory = require('../models/Inventory');
const mongoose = require('mongoose');

// Enhanced receive purchase with comprehensive validation and analytics
const enhancedReceivePurchase = asyncHandler(async (req, res) => {
  console.log('🚀 Enhanced Purchase Receiving Started');
  console.log('Purchase ID:', req.params.id);

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  // Step 1: Pre-validation using MongoDB aggregation
  const preValidationPipeline = [
    {
      $match: { 
        _id: new mongoose.Types.ObjectId(req.params.id),
        isActive: true
      }
    },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplier',
        foreignField: '_id',
        as: 'supplierInfo'
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'productDetails'
      }
    },
    {
      $lookup: {
        from: 'locations',
        localField: 'warehouse',
        foreignField: '_id',
        as: 'warehouseInfo'
      }
    },
    {
      $addFields: {
        validationChecks: {
          hasValidSupplier: { $gt: [{ $size: '$supplierInfo' }, 0] },
          hasValidProducts: { $eq: [{ $size: '$productDetails' }, { $size: '$items' }] },
          hasValidWarehouse: { 
            $cond: [
              { $ifNull: ['$warehouse', false] },
              { $gt: [{ $size: '$warehouseInfo' }, 0] },
              true
            ]
          },
          isNotAlreadyReceived: { $ne: ['$status', 'received'] },
          hasItems: { $gt: [{ $size: '$items' }, 0] }
        }
      }
    },
    {
      $project: {
        _id: 1,
        purchaseNumber: 1,
        supplier: 1,
        items: 1,
        warehouse: 1,
        status: 1,
        validationChecks: 1,
        supplierInfo: { $arrayElemAt: ['$supplierInfo', 0] },
        productDetails: 1,
        warehouseInfo: { $arrayElemAt: ['$warehouseInfo', 0] },
        totalItems: { $size: '$items' },
        totalQuantity: { $sum: '$items.quantity' },
        totalValue: '$grandTotal'
      }
    }
  ];

  const validationResult = await Purchase.aggregate(preValidationPipeline);
  
  if (!validationResult.length) {
    res.status(404);
    throw new Error('Purchase not found or inactive');
  }

  const purchaseData = validationResult[0];
  const checks = purchaseData.validationChecks;

  // Comprehensive validation checks
  if (!checks.hasValidSupplier) {
    res.status(400);
    throw new Error('Invalid supplier reference in purchase order');
  }

  if (!checks.hasValidProducts) {
    res.status(400);
    throw new Error('One or more products in the purchase order are invalid');
  }

  if (!checks.hasValidWarehouse) {
    res.status(400);
    throw new Error('Invalid warehouse/location reference');
  }

  if (!checks.isNotAlreadyReceived) {
    res.status(400);
    throw new Error('Purchase order has already been received');
  }

  if (!checks.hasItems) {
    res.status(400);
    throw new Error('Purchase order has no items to receive');
  }

  console.log('✅ Pre-validation passed');
  console.log(`   Supplier: ${purchaseData.supplierInfo.supplierName}`);
  console.log(`   Items: ${purchaseData.totalItems}`);
  console.log(`   Total Quantity: ${purchaseData.totalQuantity}`);
  console.log(`   Total Value: $${purchaseData.totalValue}`);

  // Step 2: Check for existing inventory conflicts and prepare updates
  const inventoryPreparationPipeline = [
    {
      $match: {
        product: { $in: purchaseData.items.map(item => item.product) },
        location: purchaseData.warehouse || null
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'productInfo'
      }
    },
    {
      $project: {
        product: 1,
        location: 1,
        currentQuantity: '$quantity',
        productInfo: { $arrayElemAt: ['$productInfo', 0] },
        lastUpdated: '$updatedAt'
      }
    }
  ];

  const existingInventory = await Inventory.aggregate(inventoryPreparationPipeline);
  const inventoryMap = new Map(existingInventory.map(inv => [inv.product.toString(), inv]));

  console.log('📦 Inventory Analysis:');
  console.log(`   Existing inventory records: ${existingInventory.length}`);

  // Step 3: Advanced transaction with comprehensive audit trail
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const receivingTimestamp = new Date();
    const auditEntries = [];
    const inventoryUpdates = [];

    // Process each item with detailed logging
    for (const item of purchaseData.items) {
      const productId = item.product.toString();
      const existingInv = inventoryMap.get(productId);
      
      const auditEntry = {
        user: req.user.id,
        action: 'purchase_received',
        adjustment: item.quantity,
        note: `Received from purchase ${purchaseData.purchaseNumber} - Supplier: ${purchaseData.supplierInfo.supplierName}`,
        timestamp: receivingTimestamp,
        relatedPurchaseId: purchaseData._id,
        purchaseNumber: purchaseData.purchaseNumber,
        unitCost: item.unitCost,
        totalCost: item.lineTotal
      };

      if (existingInv) {
        // Update existing inventory
        const newQuantity = existingInv.currentQuantity + item.quantity;
        auditEntry.previousQuantity = existingInv.currentQuantity;
        auditEntry.newQuantity = newQuantity;

        await Inventory.updateOne(
          { _id: existingInv._id },
          {
            $inc: { quantity: item.quantity },
            $push: { auditLog: auditEntry },
            $set: { lastUpdated: receivingTimestamp }
          },
          { session }
        );

        inventoryUpdates.push({
          action: 'updated',
          productId,
          previousQuantity: existingInv.currentQuantity,
          newQuantity,
          adjustment: item.quantity
        });

        console.log(`   📈 Updated: ${existingInv.productInfo.name} - ${existingInv.currentQuantity} → ${newQuantity}`);
      } else {
        // Create new inventory record
        auditEntry.previousQuantity = 0;
        auditEntry.newQuantity = item.quantity;

        const newInventory = new Inventory({
          product: item.product,
          location: purchaseData.warehouse || null,
          quantity: item.quantity,
          minStockLevel: 0,
          maxStockLevel: 1000,
          auditLog: [auditEntry],
          lastUpdated: receivingTimestamp
        });

        await newInventory.save({ session });

        inventoryUpdates.push({
          action: 'created',
          productId,
          previousQuantity: 0,
          newQuantity: item.quantity,
          adjustment: item.quantity
        });

        console.log(`   ✨ Created: Product ${productId} - Quantity: ${item.quantity}`);
      }

      auditEntries.push(auditEntry);
    }

    // Step 4: Update purchase with enhanced tracking
    const purchaseUpdate = {
      status: 'received',
      receivedDate: receivingTimestamp,
      receivedBy: req.user.id,
      inventoryUpdates: inventoryUpdates,
      receivingNotes: req.body.notes || 'Automatically received via enhanced system'
    };

    await Purchase.updateOne(
      { _id: purchaseData._id },
      { $set: purchaseUpdate },
      { session }
    );

    // Step 5: Generate receiving analytics
    const receivingAnalytics = {
      purchaseId: purchaseData._id,
      purchaseNumber: purchaseData.purchaseNumber,
      supplierId: purchaseData.supplier,
      supplierName: purchaseData.supplierInfo.supplierName,
      receivedAt: receivingTimestamp,
      receivedBy: req.user.id,
      totalItems: purchaseData.totalItems,
      totalQuantityReceived: purchaseData.totalQuantity,
      totalValue: purchaseData.totalValue,
      warehouseId: purchaseData.warehouse,
      warehouseName: purchaseData.warehouseInfo?.name || 'Default Location',
      inventoryUpdates: inventoryUpdates,
      processingTimeMs: Date.now() - receivingTimestamp.getTime()
    };

    await session.commitTransaction();

    console.log('✅ Purchase received successfully');
    console.log(`   Processing time: ${receivingAnalytics.processingTimeMs}ms`);

    // Step 6: Fetch and return updated purchase with full population
    const updatedPurchase = await Purchase.findById(purchaseData._id)
      .populate('supplier', 'supplierName code email phone')
      .populate('items.product', 'name sku')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name email')
      .populate('receivedBy', 'name email');

    res.json({
      success: true,
      message: 'Purchase received successfully with enhanced validation',
      purchase: updatedPurchase,
      analytics: receivingAnalytics,
      inventoryChanges: inventoryUpdates.length,
      receivingTimestamp: receivingTimestamp
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Enhanced receiving failed:', error.message);
    throw error;
  } finally {
    session.endSession();
  }
});

// Enhanced analytics for received purchases
const getReceivingAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, supplierId, warehouseId } = req.query;

  const matchStage = {
    status: 'received',
    receivedDate: { $exists: true }
  };

  if (startDate || endDate) {
    matchStage.receivedDate = {};
    if (startDate) matchStage.receivedDate.$gte = new Date(startDate);
    if (endDate) matchStage.receivedDate.$lte = new Date(endDate);
  }

  if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
    matchStage.supplier = new mongoose.Types.ObjectId(supplierId);
  }

  if (warehouseId && mongoose.Types.ObjectId.isValid(warehouseId)) {
    matchStage.warehouse = new mongoose.Types.ObjectId(warehouseId);
  }

  const analyticsPipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplier',
        foreignField: '_id',
        as: 'supplierInfo'
      }
    },
    {
      $lookup: {
        from: 'locations',
        localField: 'warehouse',
        foreignField: '_id',
        as: 'warehouseInfo'
      }
    },
    {
      $group: {
        _id: {
          supplier: '$supplier',
          supplierName: { $arrayElemAt: ['$supplierInfo.supplierName', 0] },
          warehouse: '$warehouse',
          warehouseName: { $arrayElemAt: ['$warehouseInfo.name', 0] }
        },
        totalPurchases: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' },
        totalItems: { $sum: { $size: '$items' } },
        totalQuantity: { $sum: { $sum: '$items.quantity' } },
        avgOrderValue: { $avg: '$grandTotal' },
        avgDeliveryTime: {
          $avg: {
            $divide: [
              { $subtract: ['$receivedDate', '$purchaseDate'] },
              86400000 // Convert to days
            ]
          }
        },
        lastReceived: { $max: '$receivedDate' }
      }
    },
    {
      $sort: { totalValue: -1 }
    }
  ];

  const analytics = await Purchase.aggregate(analyticsPipeline);

  // Overall summary
  const summaryPipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalReceived: { $sum: 1 },
        totalValue: { $sum: '$grandTotal' },
        totalQuantity: { $sum: { $sum: '$items.quantity' } },
        avgOrderValue: { $avg: '$grandTotal' },
        uniqueSuppliers: { $addToSet: '$supplier' },
        uniqueWarehouses: { $addToSet: '$warehouse' }
      }
    },
    {
      $project: {
        totalReceived: 1,
        totalValue: 1,
        totalQuantity: 1,
        avgOrderValue: 1,
        uniqueSuppliers: { $size: '$uniqueSuppliers' },
        uniqueWarehouses: { $size: '$uniqueWarehouses' }
      }
    }
  ];

  const summary = await Purchase.aggregate(summaryPipeline);

  res.json({
    success: true,
    summary: summary[0] || {},
    analytics,
    period: {
      startDate: startDate || 'All time',
      endDate: endDate || 'Present',
      supplierId,
      warehouseId
    }
  });
});

// Inventory validation before receiving
const validateInventoryBeforeReceiving = asyncHandler(async (req, res) => {
  const { purchaseId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  const validationPipeline = [
    {
      $match: { 
        _id: new mongoose.Types.ObjectId(purchaseId),
        isActive: true 
      }
    },
    {
      $lookup: {
        from: 'inventories',
        let: { 
          purchaseItems: '$items',
          warehouse: '$warehouse'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ['$product', '$$purchaseItems.product'] },
                  { $eq: ['$location', '$$warehouse'] }
                ]
              }
            }
          },
          {
            $lookup: {
              from: 'products',
              localField: 'product',
              foreignField: '_id',
              as: 'productInfo'
            }
          }
        ],
        as: 'currentInventory'
      }
    },
    {
      $project: {
        purchaseNumber: 1,
        items: 1,
        warehouse: 1,
        currentInventory: 1,
        conflicts: {
          $map: {
            input: '$items',
            as: 'item',
            in: {
              product: '$$item.product',
              quantity: '$$item.quantity',
              existingInventory: {
                $filter: {
                  input: '$currentInventory',
                  cond: { $eq: ['$$this.product', '$$item.product'] }
                }
              }
            }
          }
        }
      }
    }
  ];

  const validationResult = await Purchase.aggregate(validationPipeline);

  if (!validationResult.length) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  const result = validationResult[0];
  
  res.json({
    success: true,
    purchaseId,
    purchaseNumber: result.purchaseNumber,
    readyToReceive: true,
    conflicts: result.conflicts,
    summary: {
      totalItems: result.items.length,
      existingInventoryRecords: result.currentInventory.length,
      newRecordsToCreate: result.items.length - result.currentInventory.length
    }
  });
});

module.exports = {
  enhancedReceivePurchase,
  getReceivingAnalytics,
  validateInventoryBeforeReceiving
};