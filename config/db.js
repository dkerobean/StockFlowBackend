const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected!');
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  }
};

// Connection event listeners
mongoose.connection.on('connecting', () => {
  console.log('🔄 MongoDB Connecting...');
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB Disconnected!');
});

module.exports = connectDB;