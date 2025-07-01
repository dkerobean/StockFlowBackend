const asyncHandler = require('express-async-handler');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Protected
const createCustomer = asyncHandler(async (req, res) => {
  const { customerName, code, email, phone, address, city, country, description, image, status } = req.body;
  
  // Validate required fields
  if (!customerName || !email || !phone) {
    res.status(400);
    throw new Error('Customer name, email, and phone are required');
  }

  // Check if customer with same email already exists
  const customerExists = await Customer.findOne({ email: email.toLowerCase() });
  if (customerExists) {
    res.status(400);
    throw new Error('A customer with this email already exists');
  }

  // Check if customer with same code already exists (if provided)
  if (code) {
    const codeExists = await Customer.findOne({ code });
    if (codeExists) {
      res.status(400);
      throw new Error('A customer with this code already exists');
    }
  }

  const customer = new Customer({
    customerName,
    code: code || Math.random().toString(36).substring(2, 8).toUpperCase(),
    email: email.toLowerCase(),
    phone,
    address,
    city,
    country,
    description,
    image,
    status: status || 'active',
    createdBy: req.user.id
  });

  const createdCustomer = await customer.save();
  res.status(201).json(createdCustomer);
});

// @desc    Get all customers
// @route   GET /api/customers
// @access  Protected
const getCustomers = asyncHandler(async (req, res) => {
  const { search, status, country, page = 1, limit = 10 } = req.query;
  
  // Build filter object
  const filter = {};
  
  if (search) {
    filter.$or = [
      { customerName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (status) {
    filter.status = status;
  }
  
  if (country) {
    filter.country = { $regex: country, $options: 'i' };
  }

  const customers = await Customer.find(filter)
    .populate('createdBy', 'name email')
    .sort({ customerName: 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    
  const total = await Customer.countDocuments(filter);
  
  res.json({
    customers,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    total
  });
});

// @desc    Get a single customer by ID
// @route   GET /api/customers/:id
// @access  Protected
const getCustomerById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Customer ID format');
  }

  const customer = await Customer.findById(req.params.id).populate('createdBy', 'name email');
  
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }
  
  res.json(customer);
});

// @desc    Update a customer
// @route   PUT /api/customers/:id
// @access  Protected
const updateCustomer = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Customer ID format');
  }

  const customer = await Customer.findById(req.params.id);
  
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  const { customerName, email, phone, address, city, country, description, image, status } = req.body;

  // Check if email is being changed and if new email already exists
  if (email && email.toLowerCase() !== customer.email) {
    const emailExists = await Customer.findOne({ 
      email: email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    if (emailExists) {
      res.status(400);
      throw new Error('A customer with this email already exists');
    }
  }

  // Update fields
  if (customerName) customer.customerName = customerName;
  if (email) customer.email = email.toLowerCase();
  if (phone) customer.phone = phone;
  if (address !== undefined) customer.address = address;
  if (city !== undefined) customer.city = city;
  if (country !== undefined) customer.country = country;
  if (description !== undefined) customer.description = description;
  if (image !== undefined) customer.image = image;
  if (status) customer.status = status;

  const updatedCustomer = await customer.save();
  res.json(updatedCustomer);
});

// @desc    Delete a customer
// @route   DELETE /api/customers/:id
// @access  Protected
const deleteCustomer = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Customer ID format');
  }

  const customer = await Customer.findById(req.params.id);
  
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  await customer.deleteOne();
  res.status(200).json({ message: 'Customer deleted successfully' });
});

// @desc    Get customer statistics
// @route   GET /api/customers/stats
// @access  Protected
const getCustomerStats = asyncHandler(async (req, res) => {
  const totalCustomers = await Customer.countDocuments();
  const activeCustomers = await Customer.countDocuments({ status: 'active' });
  const inactiveCustomers = await Customer.countDocuments({ status: 'inactive' });
  
  // Get customers by country
  const customersByCountry = await Customer.aggregate([
    { $match: { country: { $exists: true, $ne: null, $ne: '' } } },
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  res.json({
    totalCustomers,
    activeCustomers,
    inactiveCustomers,
    customersByCountry
  });
});

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
};