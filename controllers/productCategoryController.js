const ProductCategory = require('../models/ProductCategory');

// Create product category
exports.createCategory = async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required.' });
  try {
    const exists = await ProductCategory.findOne({ name, createdBy: req.user.id });
    if (exists) return res.status(400).json({ message: 'Category already exists.' });
    const category = await ProductCategory.create({
      name,
      description,
      createdBy: req.user.id,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      status: 'active'
    });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Get all product categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await ProductCategory.find({
      $or: [
        { createdBy: req.user.id },
        { isDefault: true }
      ]
    }).sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Update product category
exports.updateCategory = async (req, res) => {
  const { name, description, status } = req.body;
  try {
    const category = await ProductCategory.findOne({ _id: req.params.id });
    if (!category) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    // Check if user has permission to update
    if (String(category.createdBy) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this category.' });
    }

    // Check if name already exists (excluding current category)
    if (name) {
      const exists = await ProductCategory.findOne({
        name,
        createdBy: req.user.id,
        _id: { $ne: req.params.id }
      });
      if (exists) return res.status(400).json({ message: 'Category name already exists.' });
    }

    const updated = await ProductCategory.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        status,
        slug: name ? name.toLowerCase().replace(/\s+/g, '-') : undefined
      },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Delete product category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await ProductCategory.findOne({ _id: req.params.id });
    if (!category) {
      return res.status(404).json({ message: 'Category not found.' });
    }

    // Check if user has permission to delete
    if (String(category.createdBy) !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this category.' });
    }

    await ProductCategory.deleteOne({ _id: req.params.id });
    res.json({ message: 'Category deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};