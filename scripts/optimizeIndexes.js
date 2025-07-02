const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Database optimization script using MongoDB MCP best practices
 * Creates optimized indexes for inventory and purchase operations
 */

async function optimizeIndexes() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    console.log('\n🚀 Starting index optimization...');

    // Inventories Collection Optimization
    console.log('\n📦 Optimizing inventories indexes...');
    
    // Compound index for product-location lookups (most common query)
    await db.collection('inventories').createIndex(
      { product: 1, location: 1 },
      { name: 'product_location_compound', unique: true }
    );
    console.log('✅ Created compound index: product_location_compound');

    // Index for low stock alerts
    await db.collection('inventories').createIndex(
      { quantity: 1, minStock: 1 },
      { name: 'stock_alert_index' }
    );
    console.log('✅ Created index: stock_alert_index');

    // Index for expiry date monitoring
    await db.collection('inventories').createIndex(
      { expiryDate: 1 },
      { 
        name: 'expiry_date_index',
        partialFilterExpression: { expiryDate: { $exists: true } }
      }
    );
    console.log('✅ Created partial index: expiry_date_index');

    // Index for audit log timestamp queries
    await db.collection('inventories').createIndex(
      { 'auditLog.timestamp': -1 },
      { name: 'audit_timestamp_index' }
    );
    console.log('✅ Created index: audit_timestamp_index');

    // Index for audit log actions
    await db.collection('inventories').createIndex(
      { 'auditLog.action': 1, 'auditLog.timestamp': -1 },
      { name: 'audit_action_timestamp_index' }
    );
    console.log('✅ Created index: audit_action_timestamp_index');

    // Purchases Collection Optimization
    console.log('\n🛒 Optimizing purchases indexes...');

    // Index for purchase receiving operations
    await db.collection('purchases').createIndex(
      { status: 1, receivedDate: -1 },
      { name: 'status_received_date_index' }
    );
    console.log('✅ Created index: status_received_date_index');

    // Index for supplier performance analysis
    await db.collection('purchases').createIndex(
      { supplier: 1, status: 1, receivedDate: -1 },
      { name: 'supplier_performance_index' }
    );
    console.log('✅ Created index: supplier_performance_index');

    // Index for warehouse activity analysis
    await db.collection('purchases').createIndex(
      { warehouse: 1, receivedDate: -1 },
      { name: 'warehouse_activity_index' }
    );
    console.log('✅ Created index: warehouse_activity_index');

    // Index for purchase date range queries
    await db.collection('purchases').createIndex(
      { purchaseDate: -1, isActive: 1 },
      { name: 'purchase_date_active_index' }
    );
    console.log('✅ Created index: purchase_date_active_index');

    // Products Collection Optimization
    console.log('\n📱 Optimizing products indexes...');

    // Text index for product search
    await db.collection('products').createIndex(
      { name: 'text', sku: 'text', description: 'text' },
      { name: 'product_text_search' }
    );
    console.log('✅ Created text index: product_text_search');

    // Index for category and brand filtering
    await db.collection('products').createIndex(
      { category: 1, brand: 1, isActive: 1 },
      { name: 'category_brand_active_index' }
    );
    console.log('✅ Created index: category_brand_active_index');

    // Sales Collection Optimization (if exists)
    const salesExists = await db.listCollections({ name: 'sales' }).hasNext();
    if (salesExists) {
      console.log('\n💰 Optimizing sales indexes...');
      
      // Index for sales analytics
      await db.collection('sales').createIndex(
        { saleDate: -1, isActive: 1 },
        { name: 'sale_date_active_index' }
      );
      console.log('✅ Created index: sale_date_active_index');

      // Index for customer sales analysis
      await db.collection('sales').createIndex(
        { customer: 1, saleDate: -1 },
        { name: 'customer_sales_index' }
      );
      console.log('✅ Created index: customer_sales_index');
    }

    // Display all indexes
    console.log('\n📊 Current index summary:');
    
    const collections = ['inventories', 'purchases', 'products', 'sales'];
    for (const collectionName of collections) {
      const collectionExists = await db.listCollections({ name: collectionName }).hasNext();
      if (collectionExists) {
        const indexes = await db.collection(collectionName).indexes();
        console.log(`\n${collectionName.toUpperCase()}:`);
        indexes.forEach(index => {
          console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
        });
      }
    }

    // Performance recommendations
    console.log('\n🎯 Performance Recommendations:');
    console.log('1. Monitor index usage with db.collection.getIndexes()');
    console.log('2. Use explain() for query optimization');
    console.log('3. Consider TTL indexes for audit logs if needed');
    console.log('4. Monitor index size and memory usage');
    console.log('5. Drop unused indexes to improve write performance');

    console.log('\n✅ Index optimization completed successfully!');

  } catch (error) {
    console.error('❌ Index optimization failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run optimization if called directly
if (require.main === module) {
  optimizeIndexes().catch(console.error);
}

module.exports = { optimizeIndexes };