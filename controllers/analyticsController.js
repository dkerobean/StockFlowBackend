const asyncHandler = require('express-async-handler');
const InventoryAnalyticsService = require('../services/inventoryAnalyticsService');
const AuditTrail = require('../models/AuditTrail');
const AuditMiddleware = require('../middleware/auditMiddleware');
const mongoose = require('mongoose');

/**
 * Real-time analytics controller with MongoDB MCP integration
 * Provides comprehensive business intelligence for inventory management
 */

// Get comprehensive dashboard analytics
const getDashboardAnalytics = asyncHandler(async (req, res) => {
  console.log('📊 Generating dashboard analytics...');
  
  try {
    const [
      inventoryOverview,
      receivingAnalytics,
      movementAnalysis,
      optimizationRecommendations,
      auditSummary
    ] = await Promise.all([
      InventoryAnalyticsService.getInventoryOverview(),
      InventoryAnalyticsService.getPurchaseReceivingAnalytics(30),
      InventoryAnalyticsService.getInventoryMovementAnalysis(null, null, 30),
      InventoryAnalyticsService.getInventoryOptimizationRecommendations(),
      AuditMiddleware.getAuditSummary(7)
    ]);

    const analytics = {
      summary: {
        timestamp: new Date(),
        period: '30 days',
        generatedBy: req.user.id
      },
      inventory: inventoryOverview[0] || {},
      purchasing: receivingAnalytics[0] || {},
      movement: movementAnalysis[0] || {},
      optimization: optimizationRecommendations[0] || {},
      audit: auditSummary || {},
      alerts: {
        critical: [],
        warnings: [],
        info: []
      }
    };

    // Generate actionable alerts
    if (analytics.inventory.summary) {
      const summary = analytics.inventory.summary;
      
      if (summary.outOfStockItems > 0) {
        analytics.alerts.critical.push({
          type: 'OUT_OF_STOCK',
          message: `${summary.outOfStockItems} products are out of stock`,
          count: summary.outOfStockItems,
          urgency: 'critical'
        });
      }

      if (summary.lowStockItems > 0) {
        analytics.alerts.warnings.push({
          type: 'LOW_STOCK',
          message: `${summary.lowStockItems} products have low stock`,
          count: summary.lowStockItems,
          urgency: 'high'
        });
      }

      if (summary.expiringSoon > 0) {
        analytics.alerts.warnings.push({
          type: 'EXPIRING_SOON',
          message: `${summary.expiringSoon} products expire within 30 days`,
          count: summary.expiringSoon,
          urgency: 'medium'
        });
      }
    }

    // Add optimization alerts
    if (analytics.optimization.summaryStats) {
      const optStats = analytics.optimization.summaryStats;
      
      if (optStats.reorderNeeded > 0) {
        analytics.alerts.warnings.push({
          type: 'REORDER_NEEDED',
          message: `${optStats.reorderNeeded} products need reordering`,
          count: optStats.reorderNeeded,
          urgency: 'high'
        });
      }

      if (optStats.overstocked > 0) {
        analytics.alerts.info.push({
          type: 'OVERSTOCKED',
          message: `${optStats.overstocked} products are overstocked`,
          count: optStats.overstocked,
          urgency: 'low'
        });
      }
    }

    console.log(`✅ Analytics generated - ${analytics.alerts.critical.length} critical, ${analytics.alerts.warnings.length} warnings`);

    res.json({
      success: true,
      analytics,
      meta: {
        generatedAt: new Date(),
        dataFreshness: 'real-time',
        cacheValid: false // Always fresh data
      }
    });

  } catch (error) {
    console.error('❌ Dashboard analytics failed:', error);
    res.status(500);
    throw new Error('Failed to generate dashboard analytics');
  }
});

// Get inventory analytics with filters
const getInventoryAnalytics = asyncHandler(async (req, res) => {
  const { productId, locationId, days = 30 } = req.query;

  console.log('📦 Generating inventory analytics...', { productId, locationId, days });

  try {
    const [overview, movement] = await Promise.all([
      InventoryAnalyticsService.getInventoryOverview(),
      InventoryAnalyticsService.getInventoryMovementAnalysis(productId, locationId, parseInt(days))
    ]);

    res.json({
      success: true,
      data: {
        overview: overview[0] || {},
        movement: movement[0] || {},
        filters: { productId, locationId, days: parseInt(days) }
      }
    });

  } catch (error) {
    console.error('❌ Inventory analytics failed:', error);
    res.status(500);
    throw new Error('Failed to generate inventory analytics');
  }
});

// Get purchase receiving analytics
const getPurchaseAnalytics = asyncHandler(async (req, res) => {
  const { supplierId, warehouseId, days = 30 } = req.query;

  console.log('🛒 Generating purchase analytics...', { supplierId, warehouseId, days });

  try {
    const analytics = await InventoryAnalyticsService.getPurchaseReceivingAnalytics(parseInt(days));

    // Filter by supplier or warehouse if specified
    let filteredData = analytics[0] || {};
    
    if (supplierId) {
      filteredData.supplierPerformance = filteredData.supplierPerformance?.filter(
        supplier => supplier._id.toString() === supplierId
      ) || [];
    }

    if (warehouseId) {
      filteredData.warehouseActivity = filteredData.warehouseActivity?.filter(
        warehouse => warehouse._id.toString() === warehouseId
      ) || [];
    }

    res.json({
      success: true,
      data: filteredData,
      filters: { supplierId, warehouseId, days: parseInt(days) }
    });

  } catch (error) {
    console.error('❌ Purchase analytics failed:', error);
    res.status(500);
    throw new Error('Failed to generate purchase analytics');
  }
});

// Get optimization recommendations
const getOptimizationRecommendations = asyncHandler(async (req, res) => {
  console.log('🎯 Generating optimization recommendations...');

  try {
    const recommendations = await InventoryAnalyticsService.getInventoryOptimizationRecommendations();
    const data = recommendations[0] || {};

    // Add priority scoring
    if (data.reorderRecommendations) {
      data.reorderRecommendations = data.reorderRecommendations.map(item => ({
        ...item,
        priorityScore: calculatePriorityScore(item),
        estimatedCost: item.reorderQuantity * (item.avgUnitCost || 0)
      }));
    }

    res.json({
      success: true,
      data,
      meta: {
        generatedAt: new Date(),
        recommendationCount: {
          reorder: data.reorderRecommendations?.length || 0,
          overstock: data.overstockItems?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Optimization recommendations failed:', error);
    res.status(500);
    throw new Error('Failed to generate optimization recommendations');
  }
});

// Get real-time alerts
const getRealTimeAlerts = asyncHandler(async (req, res) => {
  const { urgency, limit = 50 } = req.query;

  console.log('🚨 Fetching real-time alerts...', { urgency, limit });

  try {
    // Get recent critical events from audit trail
    const criticalEvents = await AuditTrail.getCriticalEvents(24);
    
    // Get current inventory alerts
    const inventoryOverview = await InventoryAnalyticsService.getInventoryOverview();
    const alerts = inventoryOverview[0]?.alertItems || [];

    // Combine and format alerts
    const allAlerts = [
      ...criticalEvents.map(event => ({
        id: event._id,
        type: 'AUDIT_EVENT',
        urgency: event.metadata?.urgencyLevel || 'medium',
        title: event.action.replace(/_/g, ' ').toUpperCase(),
        message: event.description,
        timestamp: event.timestamp,
        user: event.userId?.name || event.userEmail,
        entityType: event.entityType,
        entityId: event.entityId
      })),
      ...alerts.map(alert => ({
        id: `${alert.productId}_${alert.alertType}`,
        type: alert.alertType,
        urgency: alert.alertType === 'OUT_OF_STOCK' ? 'critical' : 'high',
        title: alert.alertType.replace(/_/g, ' '),
        message: `${alert.productName} (${alert.sku}) - ${alert.currentQuantity} units`,
        timestamp: new Date(),
        location: alert.locationName,
        productId: alert.productId,
        currentQuantity: alert.currentQuantity,
        minStock: alert.minStock
      }))
    ];

    // Filter by urgency if specified
    const filteredAlerts = urgency 
      ? allAlerts.filter(alert => alert.urgency === urgency)
      : allAlerts;

    // Sort by urgency and timestamp
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    filteredAlerts.sort((a, b) => {
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.json({
      success: true,
      alerts: filteredAlerts.slice(0, parseInt(limit)),
      summary: {
        total: filteredAlerts.length,
        critical: filteredAlerts.filter(a => a.urgency === 'critical').length,
        high: filteredAlerts.filter(a => a.urgency === 'high').length,
        medium: filteredAlerts.filter(a => a.urgency === 'medium').length,
        low: filteredAlerts.filter(a => a.urgency === 'low').length
      }
    });

  } catch (error) {
    console.error('❌ Real-time alerts failed:', error);
    res.status(500);
    throw new Error('Failed to fetch real-time alerts');
  }
});

// Get audit analytics
const getAuditAnalytics = asyncHandler(async (req, res) => {
  const { days = 7, userId, action } = req.query;

  console.log('📋 Generating audit analytics...', { days, userId, action });

  try {
    const summary = await AuditMiddleware.getAuditSummary(parseInt(days));
    
    // Get additional details if filters are specified
    let detailedResults = null;
    if (userId) {
      detailedResults = await AuditTrail.getUserActivity(userId, parseInt(days));
    } else if (action) {
      detailedResults = await AuditTrail.find({
        action: action,
        timestamp: { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) }
      })
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .limit(100);
    }

    res.json({
      success: true,
      data: {
        summary,
        details: detailedResults,
        filters: { days: parseInt(days), userId, action }
      }
    });

  } catch (error) {
    console.error('❌ Audit analytics failed:', error);
    res.status(500);
    throw new Error('Failed to generate audit analytics');
  }
});

// Export analytics data
const exportAnalytics = asyncHandler(async (req, res) => {
  const { type, format = 'json', startDate, endDate } = req.query;

  console.log('📤 Exporting analytics...', { type, format, startDate, endDate });

  try {
    let data = {};

    switch (type) {
      case 'inventory':
        data = await InventoryAnalyticsService.getInventoryOverview();
        break;
      case 'purchases':
        data = await InventoryAnalyticsService.getPurchaseReceivingAnalytics(30);
        break;
      case 'movements':
        data = await InventoryAnalyticsService.getInventoryMovementAnalysis();
        break;
      case 'audit':
        data = await AuditMiddleware.getAuditSummary(30);
        break;
      default:
        // Export all data
        data = {
          inventory: await InventoryAnalyticsService.getInventoryOverview(),
          purchases: await InventoryAnalyticsService.getPurchaseReceivingAnalytics(30),
          movements: await InventoryAnalyticsService.getInventoryMovementAnalysis(),
          audit: await AuditMiddleware.getAuditSummary(30)
        };
    }

    // Log the export action
    await AuditMiddleware.logControllerAction(
      'data_export',
      'system',
      'analytics',
      `Analytics data exported: ${type} in ${format} format`,
      req.auditContext,
      { exportType: type, format, dataSize: JSON.stringify(data).length }
    );

    res.json({
      success: true,
      data,
      meta: {
        exportedAt: new Date(),
        type,
        format,
        recordCount: Array.isArray(data) ? data.length : Object.keys(data).length
      }
    });

  } catch (error) {
    console.error('❌ Analytics export failed:', error);
    res.status(500);
    throw new Error('Failed to export analytics');
  }
});

// Helper function to calculate priority score for reorder recommendations
function calculatePriorityScore(item) {
  let score = 0;
  
  // Days of stock remaining (higher urgency = higher score)
  if (item.daysOfStock <= 1) score += 100;
  else if (item.daysOfStock <= 3) score += 80;
  else if (item.daysOfStock <= 7) score += 60;
  else if (item.daysOfStock <= 14) score += 40;
  else score += 20;
  
  // Sales velocity (higher sales = higher score)
  if (item.avgDailySales > 10) score += 30;
  else if (item.avgDailySales > 5) score += 20;
  else if (item.avgDailySales > 1) score += 10;
  
  // Urgency level
  if (item.urgency === 'CRITICAL') score += 50;
  else if (item.urgency === 'HIGH') score += 30;
  else if (item.urgency === 'MEDIUM') score += 15;
  
  return Math.min(score, 200); // Cap at 200
}

// Get admin dashboard specific data
const getAdminDashboardStats = asyncHandler(async (req, res) => {
  console.log('📊 Generating admin dashboard stats...');

  try {
    const Sale = require('../models/Sale');
    const Purchase = require('../models/Purchase');
    const Expense = require('../models/Expense');
    const Income = require('../models/Income');
    const Customer = require('../models/Customer');
    const Supplier = require('../models/Supplier');
    const Product = require('../models/Product');
    const Inventory = require('../models/Inventory');
    const Invoice = require('../models/Invoice');

    // Get current date and date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const last12Months = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Parallel database queries for performance
    const [
      totalSales,
      totalPurchases,
      totalExpenses,
      totalIncome,
      customersCount,
      suppliersCount,
      purchaseInvoicesCount,
      salesInvoicesCount,
      recentProducts,
      expiredProducts,
      monthlySalesData,
      monthlyPurchaseData,
      lowStockProducts,
      topSellingProducts
    ] = await Promise.all([
      // Financial KPIs
      Sale.aggregate([
        { $group: { _id: null, total: { $sum: '$total' }, due: { $sum: '$total' } } }
      ]),
      Purchase.aggregate([
        { $group: { _id: null, total: { $sum: '$total' }, due: { $sum: '$total' } } }
      ]),
      Expense.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Income.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      
      // Counts
      Customer.countDocuments(),
      Supplier.countDocuments(),
      Invoice.countDocuments({ type: 'purchase' }),
      Invoice.countDocuments({ type: 'sale' }),
      
      // Recent products
      Product.find({ isActive: true })
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name price imageUrl sku'),
      
      // Expired products (using createdAt as proxy for expiry)
      Product.find({ 
        isActive: true,
        createdAt: { $lt: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) } // 6 months old
      })
        .populate('category', 'name')
        .limit(10)
        .select('name sku createdAt imageUrl'),
      
      // Monthly sales data (last 12 months)
      Sale.aggregate([
        { $match: { createdAt: { $gte: last12Months } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalSales: { $sum: '$total' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      // Monthly purchase data (last 12 months)
      Purchase.aggregate([
        { $match: { createdAt: { $gte: last12Months } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            totalPurchases: { $sum: '$total' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),
      
      // Low stock products
      Inventory.aggregate([
        { $match: { quantity: { $lt: 10 } } },
        {
          $lookup: {
            from: 'products',
            localField: 'product',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        { $limit: 10 }
      ]),
      
      // Top selling products
      Sale.aggregate([
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Format chart data
    const chartData = {
      salesData: Array.from({ length: 12 }, (_, i) => {
        const month = new Date(last12Months);
        month.setMonth(month.getMonth() + i);
        const monthData = monthlySalesData.find(d => 
          d._id.year === month.getFullYear() && d._id.month === month.getMonth() + 1
        );
        return monthData ? monthData.totalSales : 0;
      }),
      purchaseData: Array.from({ length: 12 }, (_, i) => {
        const month = new Date(last12Months);
        month.setMonth(month.getMonth() + i);
        const monthData = monthlyPurchaseData.find(d => 
          d._id.year === month.getFullYear() && d._id.month === month.getMonth() + 1
        );
        return monthData ? -Math.abs(monthData.totalPurchases) : 0; // Negative for chart
      }),
      labels: Array.from({ length: 12 }, (_, i) => {
        const month = new Date(last12Months);
        month.setMonth(month.getMonth() + i);
        return month.toLocaleDateString('en-US', { month: 'short' });
      })
    };

    const dashboardStats = {
      kpis: {
        totalPurchaseDue: totalPurchases[0]?.due || 0,
        totalSalesDue: totalSales[0]?.due || 0,
        totalSaleAmount: totalSales[0]?.total || 0,
        totalExpenseAmount: totalExpenses[0]?.total || 0,
        customersCount,
        suppliersCount,
        purchaseInvoicesCount,
        salesInvoicesCount
      },
      chartData,
      recentProducts: recentProducts.map(product => ({
        id: product._id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        sku: product.sku,
        category: product.category?.name
      })),
      expiredProducts: expiredProducts.map(product => ({
        id: product._id,
        name: product.name,
        sku: product.sku,
        imageUrl: product.imageUrl,
        manufacturedDate: product.createdAt,
        expiredDate: new Date(product.createdAt.getTime() + 6 * 30 * 24 * 60 * 60 * 1000) // 6 months after creation
      })),
      alerts: {
        lowStock: lowStockProducts.length,
        expired: expiredProducts.length
      },
      topSellingProducts: topSellingProducts.map(item => ({
        id: item._id,
        name: item.productDetails.name,
        totalQuantity: item.totalQuantity,
        totalRevenue: item.totalRevenue,
        imageUrl: item.productDetails.imageUrl
      }))
    };

    res.json({
      success: true,
      data: dashboardStats,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Admin dashboard stats failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate admin dashboard stats',
      error: error.message
    });
  }
});

// Get sales dashboard specific data
const getSalesDashboardStats = asyncHandler(async (req, res) => {
  console.log('💰 Generating sales dashboard stats...');

  try {
    const Sale = require('../models/Sale');
    const Customer = require('../models/Customer');
    const Product = require('../models/Product');
    const User = require('../models/User');

    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const lastWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      weeklyEarnings,
      totalSales,
      bestSellers,
      recentTransactions,
      topCustomers,
      salesByCountry,
      salesTrends,
      salesByUser
    ] = await Promise.all([
      // Weekly earnings
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfWeek } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]),
      
      // Total sales count
      Sale.countDocuments(),
      
      // Best sellers
      Sale.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: '$productDetails' },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 }
      ]),
      
      // Recent transactions
      Sale.find()
        .populate('customer.name', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .select('total paymentMethod status createdAt customer items'),
      
      // Top customers
      Sale.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        {
          $group: {
            _id: '$customer.name',
            totalSpent: { $sum: '$total' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 5 }
      ]),
      
      // Sales by country (mock data for demo)
      Promise.resolve([
        { country: 'USA', sales: 45.2, orders: 156 },
        { country: 'UK', sales: 32.1, orders: 87 },
        { country: 'Canada', sales: 22.7, orders: 64 }
      ]),
      
      // Sales trends (last 7 days)
      Sale.aggregate([
        { $match: { createdAt: { $gte: last7Days } } },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              }
            },
            totalSales: { $sum: '$total' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]),
      
      // Sales by user/salesperson
      Sale.aggregate([
        { $match: { createdAt: { $gte: last30Days } } },
        {
          $group: {
            _id: '$createdBy',
            totalSales: { $sum: '$total' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userDetails'
          }
        },
        { $unwind: '$userDetails' },
        { $sort: { totalSales: -1 } },
        { $limit: 5 }
      ])
    ]);

    const salesDashboardStats = {
      kpis: {
        weeklyEarnings: weeklyEarnings[0]?.total || 0,
        totalSales,
        totalOrders: weeklyEarnings[0]?.count || 0,
        averageOrderValue: weeklyEarnings[0]?.total / (weeklyEarnings[0]?.count || 1) || 0
      },
      bestSellers: bestSellers.map(item => ({
        id: item._id,
        name: item.productDetails.name,
        totalQuantity: item.totalQuantity,
        totalRevenue: item.totalRevenue,
        imageUrl: item.productDetails.imageUrl,
        sku: item.productDetails.sku
      })),
      recentTransactions: recentTransactions.map(sale => ({
        id: sale._id,
        customer: sale.customer?.name || 'Walk-in Customer',
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        status: sale.status,
        date: sale.createdAt,
        itemCount: sale.items?.length || 0
      })),
      topCustomers: topCustomers.map(customer => ({
        name: customer._id || 'Unknown Customer',
        totalSpent: customer.totalSpent,
        orderCount: customer.orderCount
      })),
      salesByCountry,
      salesTrends: salesTrends.map(trend => ({
        date: trend._id.date,
        sales: trend.totalSales,
        orders: trend.count
      })),
      salesByUser: salesByUser.map(user => ({
        name: user.userDetails.name,
        totalSales: user.totalSales,
        orderCount: user.orderCount
      }))
    };

    res.json({
      success: true,
      data: salesDashboardStats,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Sales dashboard stats failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate sales dashboard stats',
      error: error.message
    });
  }
});

module.exports = {
  getDashboardAnalytics,
  getInventoryAnalytics,
  getPurchaseAnalytics,
  getOptimizationRecommendations,
  getRealTimeAlerts,
  getAuditAnalytics,
  exportAnalytics,
  getAdminDashboardStats,
  getSalesDashboardStats
};