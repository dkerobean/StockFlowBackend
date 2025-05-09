// routes/uploadRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// **** Import the required middleware functions ****
// Adjust the path '../middleware/authMiddleware' if your file structure is different
const { verifyToken, isManagerOrAdmin } = require('../middleware/authJWT');

const router = express.Router();

// --- Configure Multer Storage ---
// Ensure this path is correct relative to your project root
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'products');

// Ensure the directory exists
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`Created directory: ${uploadsDir}`);
    }
} catch (err) {
    console.error(`Error creating uploads directory: ${uploadsDir}`, err);
    // Depending on your setup, you might want to prevent the server from starting
    // process.exit(1);
}


const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadsDir); // Save to 'public/uploads/products'
    },
    filename(req, file, cb) {
        // Create a unique filename (e.g., product-timestamp.ext)
        cb(null, `product-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// --- File Filter (Optional but recommended) ---
function checkFileType(file, cb) {
    const filetypes = /jpg|jpeg|png|gif|webp/; // Allowed extensions
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        // Pass an error to Multer's error handler
        cb(new Error('Invalid file type: Only JPG, JPEG, PNG, GIF, WEBP allowed.'));
    }
}

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// --- Define the Upload Route ---
// POST /api/upload/product-image
// Apply middleware in sequence:
// 1. verifyToken: Authenticates the user and populates req.user
// 2. isManagerOrAdmin: Checks if the authenticated user has the required role
// 3. upload.single: If authenticated and authorized, processes the file upload
router.post(
    '/product-image',
    verifyToken,         // Check for valid token and set req.user
    isManagerOrAdmin,    // Ensure user is Manager or Admin
    upload.single('productImage'), // Process the image upload named 'productImage'
    (req, res) => {
        // If middleware passed and upload successful, req.file will exist
        if (!req.file) {
            // This case might not be reached if upload fails due to filter/limits,
            // but good as a fallback.
            return res.status(400).json({ message: 'Image upload failed or no file provided.' });
        }

        // Construct the public URL - Adjust if your static serving setup is different
        // This assumes '/uploads/products/' is accessible relative to your server's root URL
        const imageUrl = `/uploads/products/${req.file.filename}`;

        res.status(201).json({
            message: 'Image uploaded successfully',
            imageUrl: imageUrl // Send the relative URL back to the frontend
        });
    },
    // **** Add Multer Error Handling Middleware ****
    // This specific middleware runs *after* upload.single if Multer encounters an error
    (error, req, res, next) => {
        if (error instanceof multer.MulterError) {
            // Handle specific Multer errors (e.g., file size)
             return res.status(400).json({ message: `Upload Error: ${error.message}` });
        } else if (error) {
            // Handle errors from the fileFilter (like wrong file type)
            // or other unexpected errors during upload processing.
             return res.status(400).json({ message: error.message || "Image upload failed." });
        }
        // If no error or error was handled, proceed (though unlikely needed after response)
        next();
    }
);


module.exports = router;