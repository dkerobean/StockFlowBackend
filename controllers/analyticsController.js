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

module.exports = {
  getDashboardAnalytics,
  getInventoryAnalytics,
  getPurchaseAnalytics,
  getOptimizationRecommendations,
  getRealTimeAlerts,
  getAuditAnalytics,
  exportAnalytics
};