const mongoose = require('mongoose');

/**
 * Optimized MongoDB aggregation pipelines for inventory operations
 * Using MongoDB MCP best practices for performance and data consistency
 */

class InventoryAnalyticsService {
  
  /**
   * Get comprehensive inventory status across all locations
   */
  static async getInventoryOverview() {
    const pipeline = [
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $lookup: {
          from: 'locations',
          localField: 'location',
          foreignField: '_id',
          as: 'locationInfo'
        }
      },
      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$locationInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          stockStatus: {
            $cond: [
              { $lte: ['$quantity', '$minStock'] },
              'low',
              {
                $cond: [
                  { $eq: ['$quantity', 0] },
                  'out_of_stock',
                  'healthy'
                ]
              }
            ]
          },
          stockValue: { $multiply: ['$quantity', '$productInfo.sellingPrice'] },
          daysUntilExpiry: {
            $cond: [
              { $ifNull: ['$expiryDate', false] },
              {
                $divide: [
                  { $subtract: ['$expiryDate', '$$NOW'] },
                  86400000 // Convert to days
                ]
              },
              null
            ]
          }
        }
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalQuantity: { $sum: '$quantity' },
                totalValue: { $sum: '$stockValue' },
                lowStockItems: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'low'] }, 1, 0] }
                },
                outOfStockItems: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'out_of_stock'] }, 1, 0] }
                },
                expiringSoon: {
                  $sum: {
                    $cond: [
                      { $and: [
                        { $ne: ['$daysUntilExpiry', null] },
                        { $lte: ['$daysUntilExpiry', 30] },
                        { $gte: ['$daysUntilExpiry', 0] }
                      ]},
                      1,
                      0
                    ]
                  }
                }
              }
            }
          ],
          byLocation: [
            {
              $group: {
                _id: '$location',
                locationName: { $first: '$locationInfo.name' },
                totalProducts: { $sum: 1 },
                totalQuantity: { $sum: '$quantity' },
                totalValue: { $sum: '$stockValue' },
                lowStockCount: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'low'] }, 1, 0] }
                }
              }
            },
            { $sort: { totalValue: -1 } }
          ],
          alertItems: [
            {
              $match: {
                $or: [
                  { stockStatus: 'low' },
                  { stockStatus: 'out_of_stock' },
                  { 
                    $and: [
                      { daysUntilExpiry: { $ne: null } },
                      { daysUntilExpiry: { $lte: 30 } },
                      { daysUntilExpiry: { $gte: 0 } }
                    ]
                  }
                ]
              }
            },
            {
              $project: {
                productId: '$product',
                productName: '$productInfo.name',
                sku: '$productInfo.sku',
                locationName: '$locationInfo.name',
                currentQuantity: '$quantity',
                minStock: '$minStock',
                stockStatus: 1,
                daysUntilExpiry: 1,
                alertType: {
                  $cond: [
                    { $eq: ['$stockStatus', 'out_of_stock'] },
                    'OUT_OF_STOCK',
                    {
                      $cond: [
                        { $eq: ['$stockStatus', 'low'] },
                        'LOW_STOCK',
                        'EXPIRING_SOON'
                      ]
                    }
                  ]
                }
              }
            },
            { $sort: { alertType: 1, daysUntilExpiry: 1 } }
          ]
        }
      }
    ];

    return await mongoose.connection.db.collection('inventories').aggregate(pipeline).toArray();
  }

  /**
   * Analyze purchase receiving patterns and supplier performance
   */
  static async getPurchaseReceivingAnalytics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          status: 'received',
          receivedDate: { $gte: startDate }
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
          from: 'locations',
          localField: 'warehouse',
          foreignField: '_id',
          as: 'warehouseInfo'
        }
      },
      {
        $unwind: {
          path: '$supplierInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$warehouseInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          deliveryTime: {
            $divide: [
              { $subtract: ['$receivedDate', '$purchaseDate'] },
              86400000 // Convert to days
            ]
          },
          totalItems: { $size: '$items' },
          totalQuantity: { $sum: '$items.quantity' }
        }
      },
      {
        $facet: {
          supplierPerformance: [
            {
              $group: {
                _id: '$supplier',
                supplierName: { $first: '$supplierInfo.supplierName' },
                totalOrders: { $sum: 1 },
                totalValue: { $sum: '$grandTotal' },
                avgOrderValue: { $avg: '$grandTotal' },
                avgDeliveryTime: { $avg: '$deliveryTime' },
                totalQuantityReceived: { $sum: '$totalQuantity' },
                onTimeDeliveries: {
                  $sum: {
                    $cond: [{ $lte: ['$deliveryTime', 7] }, 1, 0] // Within 7 days
                  }
                },
                lastOrderDate: { $max: '$receivedDate' }
              }
            },
            {
              $addFields: {
                onTimeRate: {
                  $multiply: [
                    { $divide: ['$onTimeDeliveries', '$totalOrders'] },
                    100
                  ]
                }
              }
            },
            { $sort: { totalValue: -1 } }
          ],
          warehouseActivity: [
            {
              $group: {
                _id: '$warehouse',
                warehouseName: { $first: '$warehouseInfo.name' },
                totalReceivings: { $sum: 1 },
                totalValue: { $sum: '$grandTotal' },
                avgOrderValue: { $avg: '$grandTotal' },
                totalQuantity: { $sum: '$totalQuantity' },
                uniqueSuppliers: { $addToSet: '$supplier' }
              }
            },
            {
              $addFields: {
                supplierCount: { $size: '$uniqueSuppliers' }
              }
            },
            { $sort: { totalValue: -1 } }
          ],
          dailyTrends: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$receivedDate'
                  }
                },
                ordersReceived: { $sum: 1 },
                totalValue: { $sum: '$grandTotal' },
                totalQuantity: { $sum: '$totalQuantity' }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ];

    return await mongoose.connection.db.collection('purchases').aggregate(pipeline).toArray();
  }

  /**
   * Get inventory movement analysis with velocity calculations
   */
  static async getInventoryMovementAnalysis(productId = null, locationId = null, days = 90) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const matchStage = {
      'auditLog.timestamp': { $gte: startDate }
    };

    if (productId) {
      matchStage.product = new mongoose.Types.ObjectId(productId);
    }
    if (locationId) {
      matchStage.location = new mongoose.Types.ObjectId(locationId);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $lookup: {
          from: 'locations',
          localField: 'location',
          foreignField: '_id',
          as: 'locationInfo'
        }
      },
      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$locationInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: '$auditLog'
      },
      {
        $match: {
          'auditLog.timestamp': { $gte: startDate }
        }
      },
      {
        $addFields: {
          movementType: {
            $cond: [
              { $gt: ['$auditLog.adjustment', 0] },
              'inbound',
              'outbound'
            ]
          },
          absoluteMovement: { $abs: '$auditLog.adjustment' }
        }
      },
      {
        $facet: {
          movementSummary: [
            {
              $group: {
                _id: {
                  product: '$product',
                  location: '$location'
                },
                productName: { $first: '$productInfo.name' },
                sku: { $first: '$productInfo.sku' },
                locationName: { $first: '$locationInfo.name' },
                currentQuantity: { $first: '$quantity' },
                totalInbound: {
                  $sum: {
                    $cond: [
                      { $eq: ['$movementType', 'inbound'] },
                      '$absoluteMovement',
                      0
                    ]
                  }
                },
                totalOutbound: {
                  $sum: {
                    $cond: [
                      { $eq: ['$movementType', 'outbound'] },
                      '$absoluteMovement',
                      0
                    ]
                  }
                },
                totalMovements: { $sum: 1 },
                avgMovementSize: { $avg: '$absoluteMovement' },
                lastMovement: { $max: '$auditLog.timestamp' }
              }
            },
            {
              $addFields: {
                netMovement: { $subtract: ['$totalInbound', '$totalOutbound'] },
                turnoverVelocity: {
                  $cond: [
                    { $gt: ['$currentQuantity', 0] },
                    { $divide: ['$totalOutbound', '$currentQuantity'] },
                    0
                  ]
                },
                movementFrequency: {
                  $divide: ['$totalMovements', days]
                }
              }
            },
            { $sort: { turnoverVelocity: -1 } }
          ],
          movementTypes: [
            {
              $group: {
                _id: '$auditLog.action',
                count: { $sum: 1 },
                totalQuantity: { $sum: '$absoluteMovement' },
                avgQuantity: { $avg: '$absoluteMovement' }
              }
            },
            { $sort: { totalQuantity: -1 } }
          ],
          dailyMovements: [
            {
              $group: {
                _id: {
                  date: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$auditLog.timestamp'
                    }
                  },
                  type: '$movementType'
                },
                movements: { $sum: 1 },
                totalQuantity: { $sum: '$absoluteMovement' }
              }
            },
            { $sort: { '_id.date': 1, '_id.type': 1 } }
          ]
        }
      }
    ];

    return await mongoose.connection.db.collection('inventories').aggregate(pipeline).toArray();
  }

  /**
   * Optimize inventory recommendations based on historical data
   */
  static async getInventoryOptimizationRecommendations() {
    const pipeline = [
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $lookup: {
          from: 'locations',
          localField: 'location',
          foreignField: '_id',
          as: 'locationInfo'
        }
      },
      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: '$locationInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          recentMovements: {
            $filter: {
              input: '$auditLog',
              cond: {
                $gte: [
                  '$$this.timestamp',
                  { $subtract: ['$$NOW', 30 * 24 * 60 * 60 * 1000] } // Last 30 days
                ]
              }
            }
          }
        }
      },
      {
        $addFields: {
          salesInLast30Days: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$recentMovements',
                    cond: { $eq: ['$$this.action', 'sale'] }
                  }
                },
                as: 'sale',
                in: { $abs: '$$sale.adjustment' }
              }
            }
          },
          purchasesInLast30Days: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$recentMovements',
                    cond: { $eq: ['$$this.action', 'purchase_received'] }
                  }
                },
                as: 'purchase',
                in: '$$purchase.adjustment'
              }
            }
          }
        }
      },
      {
        $addFields: {
          avgDailySales: { $divide: ['$salesInLast30Days', 30] },
          daysOfStock: {
            $cond: [
              { $gt: ['$avgDailySales', 0] },
              { $divide: ['$quantity', '$avgDailySales'] },
              999 // Very high number for items with no sales
            ]
          },
          recommendedMinStock: {
            $multiply: ['$avgDailySales', 7] // 7 days of safety stock
          },
          recommendedMaxStock: {
            $multiply: ['$avgDailySales', 30] // 30 days of stock
          }
        }
      },
      {
        $addFields: {
          stockStatus: {
            $cond: [
              { $lt: ['$quantity', '$recommendedMinStock'] },
              'REORDER_NEEDED',
              {
                $cond: [
                  { $gt: ['$quantity', '$recommendedMaxStock'] },
                  'OVERSTOCK',
                  'OPTIMAL'
                ]
              }
            ]
          },
          reorderQuantity: {
            $cond: [
              { $lt: ['$quantity', '$recommendedMinStock'] },
              { $subtract: ['$recommendedMaxStock', '$quantity'] },
              0
            ]
          }
        }
      },
      {
        $facet: {
          reorderRecommendations: [
            {
              $match: { stockStatus: 'REORDER_NEEDED' }
            },
            {
              $project: {
                productId: '$product',
                productName: '$productInfo.name',
                sku: '$productInfo.sku',
                locationName: '$locationInfo.name',
                currentQuantity: '$quantity',
                recommendedMinStock: 1,
                recommendedMaxStock: 1,
                reorderQuantity: 1,
                avgDailySales: 1,
                daysOfStock: 1,
                urgency: {
                  $cond: [
                    { $lt: ['$daysOfStock', 3] },
                    'CRITICAL',
                    {
                      $cond: [
                        { $lt: ['$daysOfStock', 7] },
                        'HIGH',
                        'MEDIUM'
                      ]
                    }
                  ]
                }
              }
            },
            { $sort: { daysOfStock: 1 } }
          ],
          overstockItems: [
            {
              $match: { stockStatus: 'OVERSTOCK' }
            },
            {
              $project: {
                productId: '$product',
                productName: '$productInfo.name',
                sku: '$productInfo.sku',
                locationName: '$locationInfo.name',
                currentQuantity: '$quantity',
                recommendedMaxStock: 1,
                excessQuantity: { $subtract: ['$quantity', '$recommendedMaxStock'] },
                daysOfStock: 1
              }
            },
            { $sort: { daysOfStock: -1 } }
          ],
          summaryStats: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                reorderNeeded: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'REORDER_NEEDED'] }, 1, 0] }
                },
                overstocked: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'OVERSTOCK'] }, 1, 0] }
                },
                optimal: {
                  $sum: { $cond: [{ $eq: ['$stockStatus', 'OPTIMAL'] }, 1, 0] }
                }
              }
            }
          ]
        }
      }
    ];

    return await mongoose.connection.db.collection('inventories').aggregate(pipeline).toArray();
  }
}

module.exports = InventoryAnalyticsService;