require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); // Added for Socket.io
const socketIo = require('socket.io'); // Added for real-time
const connectDB = require('./config/db');
const { initSocket } = require('./socket');
const { startScheduler } = require('./services/notificationService');
const saleRoutes = require('./routes/saleRoutes');

const app = express();

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io with CORS config
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// CORS Configuration for Express
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Initialize Socket.io
initSocket(server);

// Start low stock scheduler
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
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/product', require('./routes/productRoutes'));
app.use('/api/sales', saleRoutes);


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