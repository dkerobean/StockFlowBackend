const ExpenseCategory = require('../models/ExpenseCategory');

// Create
exports.createCategory = async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required.' });
  try {
    const exists = await ExpenseCategory.findOne({ name, createdBy: req.user.id });
    if (exists) return res.status(400).json({ message: 'Category already exists.' });
    const category = await ExpenseCategory.create({ name, description, createdBy: req.user.id });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Read (all for user)
exports.getCategories = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find({
      $or: [
        { createdBy: req.user.id },
        { isDefault: true }
      ]
    }).sort({ createdAt: -1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Update
exports.updateCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    const category = await ExpenseCategory.findOne({ _id: req.params.id });
    // Only allow update if:
    // - not default
    // - user is creator OR user is manager/admin
    const isManagerOrAdmin = req.user.role === 'admin' || req.user.role === 'manager';
    if (!category || category.isDefault || (String(category.createdBy) !== req.user.id && !isManagerOrAdmin)) {
      return res.status(403).json({ message: 'Not allowed.' });
    }
    const exists = await ExpenseCategory.findOne({ name, createdBy: req.user.id, _id: { $ne: req.params.id } });
    if (exists) return res.status(400).json({ message: 'Category already exists.' });
    const updated = await ExpenseCategory.findOneAndUpdate(
      { _id: req.params.id },
      { name, description },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Category not found.' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Delete
exports.deleteCategory = async (req, res) => {
  try {
    const category = await ExpenseCategory.findOne({ _id: req.params.id });
    if (!category || category.isDefault) {
      return res.status(403).json({ message: 'Not allowed.' });
    }
    await ExpenseCategory.deleteOne({ _id: req.params.id });
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
};