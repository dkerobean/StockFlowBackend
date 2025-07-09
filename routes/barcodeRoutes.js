// routes/barcodeRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, isManagerOrAdmin } = require('../middleware/authJwt');
const barcodeService = require('../services/barcodeService');
const Product = require('../models/Product');
const asyncHandler = require('express-async-handler');

/**
 * @route POST /api/barcodes/generate
 * @desc Generate barcode image
 * @access Private (Manager/Admin)
 */
router.post('/generate', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { text, format, width, height, displayValue } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Barcode text is required'
      });
    }
    
    // Validate barcode format
    const isValidFormat = barcodeService.validateBarcodeFormat(text, format);
    if (!isValidFormat) {
      return res.status(400).json({
        success: false,
        message: `Invalid barcode format for text: ${text}`
      });
    }
    
    const options = {
      format: format || 'CODE128',
      width: width || 2,
      height: height || 100,
      displayValue: displayValue !== false
    };
    
    const barcodeInfo = await barcodeService.generateBarcodeImage(text, options);
    
    res.json({
      success: true,
      message: 'Barcode generated successfully',
      data: barcodeInfo
    });
  } catch (error) {
    console.error('Error generating barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate barcode',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/generate-base64
 * @desc Generate barcode as base64 string
 * @access Private (Manager/Admin)
 */
router.post('/generate-base64', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { text, format, width, height, displayValue } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Barcode text is required'
      });
    }
    
    const options = {
      format: format || 'CODE128',
      width: width || 2,
      height: height || 100,
      displayValue: displayValue !== false
    };
    
    const barcodeInfo = await barcodeService.generateBarcodeBase64(text, options);
    
    res.json({
      success: true,
      message: 'Barcode generated successfully',
      data: barcodeInfo
    });
  } catch (error) {
    console.error('Error generating barcode base64:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate barcode',
      error: error.message
    });
  }
}));

/**
 * @route GET /api/barcodes/product/:productId
 * @desc Get barcode image for specific product
 * @access Private
 */
router.get('/product/:productId', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { productId } = req.params;
    const { format, regenerate } = req.query;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    if (!product.barcode) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a barcode'
      });
    }
    
    const options = {
      format: format || 'CODE128',
      width: 2,
      height: 100,
      displayValue: true
    };
    
    let barcodeInfo;
    
    if (regenerate === 'true') {
      // Generate new barcode image
      barcodeInfo = await barcodeService.generateBarcodeImage(product.barcode, options);
    } else {
      // Try to get existing barcode or generate new one
      try {
        barcodeInfo = await barcodeService.generateBarcodeImage(product.barcode, options);
      } catch (error) {
        console.error('Error generating barcode for product:', error);
        throw error;
      }
    }
    
    res.json({
      success: true,
      message: 'Product barcode retrieved successfully',
      data: {
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        ...barcodeInfo
      }
    });
  } catch (error) {
    console.error('Error getting product barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product barcode',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/batch
 * @desc Generate multiple barcodes for batch operations
 * @access Private (Manager/Admin)
 */
router.post('/batch', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { productIds, format, width, height } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }
    
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found with provided IDs'
      });
    }
    
    const options = {
      format: format || 'CODE128',
      width: width || 2,
      height: height || 100,
      displayValue: true
    };
    
    const barcodeInfo = await barcodeService.generateBatchBarcodes(products, options);
    
    res.json({
      success: true,
      message: 'Batch barcodes generated successfully',
      data: barcodeInfo
    });
  } catch (error) {
    console.error('Error generating batch barcodes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate batch barcodes',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/qr-code
 * @desc Generate QR code image
 * @access Private (Manager/Admin)
 */
router.post('/qr-code', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { text, width, height } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'QR code text is required'
      });
    }
    
    const options = {
      width: width || 200,
      height: height || 200,
      margin: 2
    };
    
    const qrInfo = await barcodeService.generateQRCode(text, options);
    
    res.json({
      success: true,
      message: 'QR code generated successfully',
      data: qrInfo
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/qr-code-base64
 * @desc Generate QR code as base64 string
 * @access Private (Manager/Admin)
 */
router.post('/qr-code-base64', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { text, width, height } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'QR code text is required'
      });
    }
    
    const options = {
      width: width || 200,
      height: height || 200,
      margin: 2
    };
    
    const qrInfo = await barcodeService.generateQRCodeBase64(text, options);
    
    res.json({
      success: true,
      message: 'QR code generated successfully',
      data: qrInfo
    });
  } catch (error) {
    console.error('Error generating QR code base64:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/auto-generate
 * @desc Generate auto barcode for product
 * @access Private (Manager/Admin)
 */
router.post('/auto-generate', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { productId, sku, prefix } = req.body;
    
    if (!productId || !sku) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and SKU are required'
      });
    }
    
    const autoBarcode = barcodeService.generateAutoBarcode(productId, sku, prefix);
    
    // Generate barcode image
    const barcodeInfo = await barcodeService.generateBarcodeImage(autoBarcode);
    
    res.json({
      success: true,
      message: 'Auto barcode generated successfully',
      data: {
        barcode: autoBarcode,
        ...barcodeInfo
      }
    });
  } catch (error) {
    console.error('Error generating auto barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate auto barcode',
      error: error.message
    });
  }
}));

/**
 * @route POST /api/barcodes/validate
 * @desc Validate barcode format
 * @access Private
 */
router.post('/validate', verifyToken, asyncHandler(async (req, res) => {
  try {
    const { text, format } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Barcode text is required'
      });
    }
    
    const isValid = barcodeService.validateBarcodeFormat(text, format || 'CODE128');
    
    res.json({
      success: true,
      message: 'Barcode validation completed',
      data: {
        text,
        format: format || 'CODE128',
        isValid
      }
    });
  } catch (error) {
    console.error('Error validating barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate barcode',
      error: error.message
    });
  }
}));

/**
 * @route DELETE /api/barcodes/cleanup
 * @desc Clean up old barcode files
 * @access Private (Admin)
 */
router.delete('/cleanup', verifyToken, isManagerOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { olderThanDays } = req.query;
    
    const deletedCount = await barcodeService.cleanupOldBarcodes(
      olderThanDays ? parseInt(olderThanDays) : 30
    );
    
    res.json({
      success: true,
      message: 'Barcode cleanup completed',
      data: {
        deletedCount
      }
    });
  } catch (error) {
    console.error('Error cleaning up barcodes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup barcodes',
      error: error.message
    });
  }
}));

module.exports = router;