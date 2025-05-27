const asyncHandler = require('express-async-handler');
const Supplier = require('../models/Supplier');
const mongoose = require('mongoose');

// @desc    Create a new supplier
// @route   POST /api/suppliers
// @access  Protected
const createSupplier = asyncHandler(async (req, res) => {
  const { supplierName, code, email, phone, country, image } = req.body;
  if (!supplierName || !code || !email || !phone) {
    res.status(400);
    throw new Error('All required fields must be provided');
  }
  const supplierExists = await Supplier.findOne({ code });
  if (supplierExists) {
    res.status(400);
    throw new Error('A supplier with this code already exists');
  }
  const supplier = new Supplier({
    supplierName,
    code,
    email,
    phone,
    country,
    image,
    createdBy: req.user.id
  });
  const createdSupplier = await supplier.save();
  res.status(201).json(createdSupplier);
});

// @desc    Get all suppliers
// @route   GET /api/suppliers
// @access  Protected
const getSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find().populate('createdBy', 'name email').sort({ supplierName: 1 });
  res.json(suppliers);
});

// @desc    Get a single supplier by ID
// @route   GET /api/suppliers/:id
// @access  Protected
const getSupplierById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Supplier ID format');
  }
  const supplier = await Supplier.findById(req.params.id).populate('createdBy', 'name email');
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }
  res.json(supplier);
});

// @desc    Update a supplier
// @route   PUT /api/suppliers/:id
// @access  Protected
const updateSupplier = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Supplier ID format');
  }
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }
  const { supplierName, code, email, phone, country, image } = req.body;
  if (supplierName) supplier.supplierName = supplierName;
  if (code) supplier.code = code;
  if (email) supplier.email = email;
  if (phone) supplier.phone = phone;
  if (country) supplier.country = country;
  if (image) supplier.image = image;
  const updatedSupplier = await supplier.save();
  res.json(updatedSupplier);
});

// @desc    Delete a supplier
// @route   DELETE /api/suppliers/:id
// @access  Protected
const deleteSupplier = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid Supplier ID format');
  }
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) {
    res.status(404);
    throw new Error('Supplier not found');
  }
  await supplier.deleteOne();
  res.status(200).json({ message: 'Supplier deleted successfully' });
});

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
};