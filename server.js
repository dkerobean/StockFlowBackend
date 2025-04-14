require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // Added for Socket.io
const socketIo = require('socket.io'); // Added for real-time
const connectDB = require('./config/db');
const { initSocket, getIO } = require('./socket');
const { startScheduler } = require('./services/notificationService');

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
const categoryRoutes = require('./routes/categoryRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

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
  origin: process.env.CLIENT_URL || 'http://localhost:4000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
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
app.use('/api/categories', categoryRoutes)
app.use('/api/upload', uploadRoutes);


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

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));