require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // Added for Socket.io
const socketIo = require('socket.io'); // Added for real-time
const connectDB = require('./config/db');
const { initSocket, getIO } = require('./socket');
const { startScheduler } = require('./services/notificationService');
const Expense = require('./models/Expense'); // Added for initializing expense categories
const ExpenseCategory = require('./models/ExpenseCategory');
const ProductCategory = require('./models/ProductCategory'); // Add this line

const locationRoutes = require('./routes/locationRoutes');
const productRoutes = require('./routes/productRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const stockTransferRoutes = require('./routes/stockTransferRoutes');
const saleRoutes = require('./routes/saleRoutes');
const incomeRoutes = require('./routes/incomeRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');
const brandRoutes = require('./routes/brandRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const stockAdjustmentRoutes = require('./routes/stockAdjustmentRoutes'); // Added for stock adjustments
const expenseCategoryRoutes = require('./routes/expenseCategoryRoutes'); // Added for expense categories
const incomeCategoryRoutes = require('./routes/incomeCategoryRoutes'); // Added for income categories
const supplierRoutes = require('./routes/supplierRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productCategoryRoutes = require('./routes/productCategoryRoutes'); // Add this line
const purchaseRoutes = require('./routes/purchaseRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const testRoutes = require('./routes/testRoutes');

const app = express();
const path = require('path');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io with CORS config
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:4000',
    methods: ['GET', 'POST']
  }
});

// CORS Configuration for Express
const corsOptions = {
  origin: [
    process.env.CLIENT_URL || 'http://localhost:4000',
    'http://localhost:3000', // React dev server default
    'http://localhost:4000', // Custom frontend port
    'http://127.0.0.1:4000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Cache-Control', 
    'Pragma', 
    'Expires',
    'X-Requested-With'
  ],
  credentials: true, // Allow credentials
  optionsSuccessStatus: 200 // For legacy browser support
};

console.log('🌐 CORS Configuration:', corsOptions);
app.use(cors(corsOptions));

// Initialize Socket.io
initSocket(server);
startScheduler();

// Middleware
app.use(express.json());

// Attach Socket.io to requests
app.use((req, res, next) => {
  req.io = io; // Now routes can access io via req.io
  next();
});

// Database connection
connectDB();

// Remove problematic expense initialization - handled by ExpenseCategory model instead

const defaultCategories = [
  { name: 'Supplies', description: 'Office and business supplies', isDefault: true },
  { name: 'Rent', description: 'Office or warehouse rent', isDefault: true },
  { name: 'Utilities', description: 'Electricity, water, internet, etc.', isDefault: true },
  { name: 'Salaries', description: 'Employee salaries and wages', isDefault: true },
  { name: 'Marketing', description: 'Advertising and marketing expenses', isDefault: true },
  { name: 'Travel', description: 'Business travel expenses', isDefault: true },
  { name: 'Equipment', description: 'Machinery and equipment', isDefault: true },
  { name: 'Software', description: 'Software subscriptions and licenses', isDefault: true },
  { name: 'Taxes', description: 'Business taxes', isDefault: true },
  { name: 'Other', description: 'Other miscellaneous expenses', isDefault: true }
];

async function insertDefaultCategories() {
  for (const cat of defaultCategories) {
    await ExpenseCategory.updateOne(
      { name: cat.name, createdBy: null },
      { $setOnInsert: cat },
      { upsert: true }
    );
  }
}

const defaultProductCategories = [
  { name: 'Electronics', description: 'Electronic devices and accessories', isDefault: true },
  { name: 'Clothing', description: 'Apparel and fashion items', isDefault: true },
  { name: 'Food & Beverages', description: 'Food and drink products', isDefault: true },
  { name: 'Home & Kitchen', description: 'Home goods and kitchen items', isDefault: true },
  { name: 'Beauty & Personal Care', description: 'Beauty and personal care products', isDefault: true },
  { name: 'Sports & Outdoors', description: 'Sports equipment and outdoor gear', isDefault: true },
  { name: 'Books & Media', description: 'Books, movies, and other media', isDefault: true },
  { name: 'Toys & Games', description: 'Toys and games for all ages', isDefault: true },
  { name: 'Health & Wellness', description: 'Health and wellness products', isDefault: true },
  { name: 'Other', description: 'Other miscellaneous products', isDefault: true }
];

async function insertDefaultProductCategories() {
  for (const cat of defaultProductCategories) {
    // Generate slug from name for uniqueness
    const slug = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    await ProductCategory.updateOne(
      { name: cat.name, createdBy: null },
      { $setOnInsert: { ...cat, slug } },
      { upsert: true }
    );
  }
}

// Initialize default data after database connection
connectDB().then(async () => {
  try {
    await insertDefaultCategories();
    console.log('✅ Default expense categories initialized');
    await insertDefaultProductCategories();
    console.log('✅ Default product categories initialized');
  } catch (error) {
    console.error('Error initializing default data:', error);
  }
}).catch(console.error);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transfers', stockTransferRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/stock-adjustments', stockAdjustmentRoutes);
app.use('/api/categories', expenseCategoryRoutes);
app.use('/api/income-categories', incomeCategoryRoutes);
app.use('/api/product-categories', productCategoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/test', testRoutes);

// Protected Route
app.get('/api/protected',
  require('./middleware/authJwt').verifyToken,
  (req, res) => {
    res.json({ message: 'Protected route accessed' });
  }
);

// Add this after all routes
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Initialize Socket.io with error handling
initSocket(io);

// Start notification scheduler with error handling
try {
  startScheduler();
  console.log('✅ Notification scheduler started');
} catch (error) {
  console.error('Failed to start notification scheduler:', error);
}

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('✅ StockFlow Backend Ready');
});