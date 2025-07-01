const asyncHandler = require('express-async-handler');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Inventory = require('../models/Inventory');
const mongoose = require('mongoose');

// @desc    Create a new purchase
// @route   POST /api/purchases
// @access  Protected
const createPurchase = asyncHandler(async (req, res) => {
  console.log('=== Create Purchase Request ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  const { 
    supplier, 
    purchaseDate, 
    dueDate,
    referenceNumber,
    status,
    items,
    orderTax,
    discountAmount,
    shippingCost,
    notes,
    warehouse
  } = req.body;

  console.log('Extracted fields:', {
    supplier,
    itemsCount: items?.length,
    orderTax: typeof orderTax + ' = ' + orderTax,
    discountAmount: typeof discountAmount + ' = ' + discountAmount,
    shippingCost: typeof shippingCost + ' = ' + shippingCost
  });

  if (!supplier || !items || !Array.isArray(items) || items.length === 0) {
    console.log('Validation failed: Missing supplier or items');
    res.status(400);
    throw new Error('Supplier and at least one item are required');
  }

  // Validate supplier exists
  const supplierExists = await Supplier.findById(supplier);
  if (!supplierExists) {
    res.status(404);
    throw new Error('Supplier not found');
  }

  // Validate all products exist
  const productIds = items.map(item => item.product);
  const products = await Product.find({ _id: { $in: productIds } });
  
  if (products.length !== productIds.length) {
    res.status(404);
    throw new Error('One or more products not found');
  }

  // Validate item data
  console.log('Validating items:', items);
  const validatedItems = items.map((item, index) => {
    console.log(`Item ${index + 1}:`, {
      product: item.product,
      quantity: typeof item.quantity + ' = ' + item.quantity,
      unitCost: typeof item.unitCost + ' = ' + item.unitCost,
      discount: typeof item.discount + ' = ' + item.discount,
      taxRate: typeof item.taxRate + ' = ' + item.taxRate
    });
    
    if (!item.product || !item.quantity || !item.unitCost) {
      console.log(`Item ${index + 1} validation failed:`, { 
        hasProduct: !!item.product, 
        hasQuantity: !!item.quantity, 
        hasUnitCost: !!item.unitCost 
      });
      throw new Error('Each item must have product, quantity, and unitCost');
    }
    
    const validatedItem = {
      product: item.product,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      discount: Number(item.discount) || 0,
      taxRate: Number(item.taxRate) || 0
    };
    
    console.log(`Validated item ${index + 1}:`, validatedItem);
    return validatedItem;
  });

  const purchaseData = {
    supplier,
    purchaseDate: purchaseDate || new Date(),
    dueDate,
    referenceNumber,
    status: status || 'pending',
    items: validatedItems,
    orderTax: Number(orderTax) || 0,
    discountAmount: Number(discountAmount) || 0,
    shippingCost: Number(shippingCost) || 0,
    notes,
    warehouse: warehouse && warehouse.trim() !== '' ? warehouse : undefined,
    createdBy: req.user.id
  };
  
  console.log('Creating purchase with data:', JSON.stringify(purchaseData, null, 2));
  
  const purchase = new Purchase(purchaseData);
  
  let createdPurchase;
  try {
    createdPurchase = await purchase.save();
    console.log('Purchase created successfully:', createdPurchase._id);
  } catch (error) {
    console.log('Purchase save error:', error.message);
    console.log('Purchase validation errors:', error.errors);
    throw error;
  }
  
  // Populate the created purchase
  const populatedPurchase = await Purchase.findById(createdPurchase._id)
    .populate('supplier', 'supplierName code email phone')
    .populate('items.product', 'name sku')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name email');

  res.status(201).json(populatedPurchase);
});

// @desc    Record payment for purchase
// @route   POST /api/purchases/:id/payment
// @access  Protected
const recordPayment = asyncHandler(async (req, res) => {
  console.log('=== Record Payment Request ===');
  console.log('Purchase ID:', req.params.id);
  console.log('Payment data:', req.body);
  
  const { paymentAmount, paymentMethod = 'cash', paymentDate = new Date(), notes = '' } = req.body;

  if (!paymentAmount || paymentAmount <= 0) {
    res.status(400);
    throw new Error('Payment amount must be greater than 0');
  }

  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  const remainingAmount = purchase.grandTotal - purchase.amountPaid;
  if (paymentAmount > remainingAmount) {
    res.status(400);
    throw new Error(`Payment amount cannot exceed remaining balance of $${remainingAmount.toFixed(2)}`);
  }

  // Update payment amounts
  purchase.amountPaid += Number(paymentAmount);
  purchase.amountDue = purchase.grandTotal - purchase.amountPaid;

  // Update payment status
  if (purchase.amountPaid >= purchase.grandTotal) {
    purchase.paymentStatus = 'paid';
  } else if (purchase.amountPaid > 0) {
    purchase.paymentStatus = 'partial';
  }

  await purchase.save();

  // Populate and return updated purchase
  const updatedPurchase = await Purchase.findById(purchase._id)
    .populate('supplier', 'supplierName code email phone')
    .populate('items.product', 'name sku')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name email');

  console.log('Payment recorded successfully:', { 
    paymentAmount, 
    newAmountPaid: purchase.amountPaid,
    newPaymentStatus: purchase.paymentStatus 
  });

  res.json({
    message: 'Payment recorded successfully',
    purchase: updatedPurchase,
    paymentAmount: Number(paymentAmount)
  });
});

// @desc    Get all purchases with search and filtering
// @route   GET /api/purchases
// @access  Protected
const getPurchases = asyncHandler(async (req, res) => {
  const { 
    search, 
    supplier, 
    status, 
    paymentStatus,
    startDate,
    endDate,
    page = 1, 
    limit = 10 
  } = req.query;

  // Build filter object
  const filter = { isActive: true };

  // Search functionality
  if (search) {
    filter.$or = [
      { purchaseNumber: { $regex: search, $options: 'i' } },
      { referenceNumber: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by supplier
  if (supplier && mongoose.Types.ObjectId.isValid(supplier)) {
    filter.supplier = supplier;
  }

  // Filter by status
  if (status) {
    filter.status = status;
  }

  // Filter by payment status
  if (paymentStatus) {
    filter.paymentStatus = paymentStatus;
  }

  // Date range filter
  if (startDate || endDate) {
    filter.purchaseDate = {};
    if (startDate) filter.purchaseDate.$gte = new Date(startDate);
    if (endDate) filter.purchaseDate.$lte = new Date(endDate);
  }

  const purchases = await Purchase.find(filter)
    .populate('supplier', 'supplierName code email phone')
    .populate('items.product', 'name sku')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name email')
    .sort({ purchaseDate: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Purchase.countDocuments(filter);

  res.json({
    purchases,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    total
  });
});

// @desc    Get a single purchase by ID
// @route   GET /api/purchases/:id
// @access  Protected
const getPurchaseById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  const purchase = await Purchase.findById(req.params.id)
    .populate('supplier', 'supplierName code email phone country')
    .populate('items.product', 'name sku description image')
    .populate('warehouse', 'name address')
    .populate('createdBy', 'name email');

  if (!purchase || !purchase.isActive) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  res.json(purchase);
});

// @desc    Update a purchase
// @route   PUT /api/purchases/:id
// @access  Protected
const updatePurchase = asyncHandler(async (req, res) => {
  const { 
    supplier, 
    purchaseDate, 
    dueDate,
    referenceNumber,
    status,
    items,
    orderTax,
    discountAmount,
    shippingCost,
    notes,
    warehouse,
    amountPaid
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  const purchase = await Purchase.findById(req.params.id);

  if (!purchase || !purchase.isActive) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  // Validate supplier if provided
  if (supplier) {
    const supplierExists = await Supplier.findById(supplier);
    if (!supplierExists) {
      res.status(404);
      throw new Error('Supplier not found');
    }
    purchase.supplier = supplier;
  }

  // Update fields
  if (purchaseDate) purchase.purchaseDate = purchaseDate;
  if (dueDate) purchase.dueDate = dueDate;
  if (referenceNumber !== undefined) purchase.referenceNumber = referenceNumber;
  if (status) purchase.status = status;
  if (orderTax !== undefined) purchase.orderTax = Number(orderTax);
  if (discountAmount !== undefined) purchase.discountAmount = Number(discountAmount);
  if (shippingCost !== undefined) purchase.shippingCost = Number(shippingCost);
  if (notes !== undefined) purchase.notes = notes;
  if (warehouse) purchase.warehouse = warehouse;
  if (amountPaid !== undefined) purchase.amountPaid = Number(amountPaid);

  // Update items if provided
  if (items && Array.isArray(items)) {
    // Validate all products exist
    const productIds = items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    
    if (products.length !== productIds.length) {
      res.status(404);
      throw new Error('One or more products not found');
    }

    const validatedItems = items.map(item => {
      if (!item.product || !item.quantity || !item.unitCost) {
        throw new Error('Each item must have product, quantity, and unitCost');
      }
      
      return {
        product: item.product,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        discount: Number(item.discount) || 0,
        taxRate: Number(item.taxRate) || 0
      };
    });

    purchase.items = validatedItems;
  }

  const updatedPurchase = await purchase.save();

  // Populate the updated purchase
  const populatedPurchase = await Purchase.findById(updatedPurchase._id)
    .populate('supplier', 'supplierName code email phone')
    .populate('items.product', 'name sku')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name email');

  res.json(populatedPurchase);
});

// @desc    Delete a purchase (soft delete)
// @route   DELETE /api/purchases/:id
// @access  Protected
const deletePurchase = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  const purchase = await Purchase.findById(req.params.id);

  if (!purchase) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  if (!purchase.isActive) {
    res.status(200).json({ 
      message: 'Purchase already deleted', 
      purchase 
    });
    return;
  }

  purchase.isActive = false;
  const updatedPurchase = await purchase.save();

  res.status(200).json({ 
    message: 'Purchase deleted successfully', 
    purchase: updatedPurchase 
  });
});

// @desc    Receive purchase (update inventory)
// @route   POST /api/purchases/:id/receive
// @access  Protected
const receivePurchase = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Purchase ID format');
  }

  const purchase = await Purchase.findById(req.params.id)
    .populate('items.product');

  if (!purchase || !purchase.isActive) {
    res.status(404);
    throw new Error('Purchase not found');
  }

  if (purchase.status === 'received') {
    res.status(400);
    throw new Error('Purchase has already been received');
  }

  // Start a transaction for inventory updates
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update inventory for each item
    for (const item of purchase.items) {
      const inventoryFilter = {
        product: item.product._id,
        location: purchase.warehouse || null
      };

      const existingInventory = await Inventory.findOne(inventoryFilter).session(session);

      if (existingInventory) {
        // Update existing inventory
        existingInventory.quantity += item.quantity;
        existingInventory.lastUpdated = new Date();
        await existingInventory.save({ session });
      } else {
        // Create new inventory record
        const newInventory = new Inventory({
          product: item.product._id,
          location: purchase.warehouse || null,
          quantity: item.quantity,
          minStockLevel: 0,
          maxStockLevel: 1000,
          lastUpdated: new Date()
        });
        await newInventory.save({ session });
      }
    }

    // Update purchase status
    purchase.status = 'received';
    purchase.receivedDate = new Date();
    await purchase.save({ session });

    await session.commitTransaction();

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('supplier', 'supplierName code email phone')
      .populate('items.product', 'name sku')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name email');

    res.json({
      message: 'Purchase received successfully and inventory updated',
      purchase: populatedPurchase
    });

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// @desc    Get purchase statistics
// @route   GET /api/purchases/stats
// @access  Protected
const getPurchaseStats = asyncHandler(async (req, res) => {
  const totalPurchases = await Purchase.countDocuments({ isActive: true });
  const pendingPurchases = await Purchase.countDocuments({ status: 'pending', isActive: true });
  const receivedPurchases = await Purchase.countDocuments({ status: 'received', isActive: true });
  const unpaidPurchases = await Purchase.countDocuments({ paymentStatus: 'unpaid', isActive: true });

  // Total purchase value
  const totalValueResult = await Purchase.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, total: { $sum: '$grandTotal' } } }
  ]);
  const totalValue = totalValueResult.length > 0 ? totalValueResult[0].total : 0;

  // Purchase trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentPurchases = await Purchase.countDocuments({
    purchaseDate: { $gte: thirtyDaysAgo },
    isActive: true
  });

  // Top suppliers by purchase value
  const topSuppliers = await Purchase.aggregate([
    { $match: { isActive: true } },
    { $group: { 
      _id: '$supplier', 
      totalValue: { $sum: '$grandTotal' },
      purchaseCount: { $sum: 1 }
    }},
    { $sort: { totalValue: -1 } },
    { $limit: 5 },
    { $lookup: {
      from: 'suppliers',
      localField: '_id',
      foreignField: '_id',
      as: 'supplier'
    }},
    { $unwind: '$supplier' },
    { $project: {
      supplierName: '$supplier.supplierName',
      totalValue: 1,
      purchaseCount: 1
    }}
  ]);

  // Purchase status distribution
  const statusDistribution = await Purchase.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({
    totalPurchases,
    pendingPurchases,
    receivedPurchases,
    unpaidPurchases,
    totalValue,
    recentPurchases,
    topSuppliers,
    statusDistribution
  });
});

// @desc    Get purchase order report data
// @route   GET /api/purchases/report
// @access  Protected
const getPurchaseReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, supplier, status } = req.query;

  // Build filter
  const filter = { isActive: true };
  
  if (startDate || endDate) {
    filter.purchaseDate = {};
    if (startDate) filter.purchaseDate.$gte = new Date(startDate);
    if (endDate) filter.purchaseDate.$lte = new Date(endDate);
  }
  
  if (supplier && mongoose.Types.ObjectId.isValid(supplier)) {
    filter.supplier = supplier;
  }
  
  if (status) {
    filter.status = status;
  }

  // Aggregate purchase data by product
  const reportData = await Purchase.aggregate([
    { $match: filter },
    { $unwind: '$items' },
    { $group: {
      _id: '$items.product',
      totalQuantity: { $sum: '$items.quantity' },
      totalAmount: { $sum: '$items.lineTotal' },
      averagePrice: { $avg: '$items.unitCost' },
      purchaseCount: { $sum: 1 }
    }},
    { $lookup: {
      from: 'products',
      localField: '_id',
      foreignField: '_id',
      as: 'product'
    }},
    { $unwind: '$product' },
    { $lookup: {
      from: 'inventories',
      localField: '_id',
      foreignField: 'product',
      as: 'inventory'
    }},
    { $project: {
      productName: '$product.name',
      productSku: '$product.sku',
      productImage: '$product.image',
      totalQuantity: 1,
      totalAmount: 1,
      averagePrice: 1,
      purchaseCount: 1,
      currentStock: { 
        $sum: '$inventory.quantity'
      }
    }},
    { $sort: { totalAmount: -1 } }
  ]);

  res.json(reportData);
});

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  updatePurchase,
  deletePurchase,
  receivePurchase,
  recordPayment,
  getPurchaseStats,
  getPurchaseReport
};