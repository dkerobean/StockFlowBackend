require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// CORS Configuration
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());

// Database
connectDB();

// Routes
app.use('/api/auth', require('./routes/authRoutes'));

// Protected Route (Fixed Path)
app.get('/api/protected',
  require('./middleware/authJwt').verifyToken, // Fixed path
  (req, res) => {
    res.json({ message: 'Protected route accessed' });
  }
);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));