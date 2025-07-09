// services/barcodeService.js
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

class BarcodeService {
  constructor() {
    this.defaultOptions = {
      format: 'CODE128',
      width: 2,
      height: 100,
      displayValue: true,
      fontSize: 14,
      textMargin: 5,
      margin: 10,
      background: '#ffffff',
      lineColor: '#000000'
    };
    
    // Ensure barcode directory exists
    this.barcodeDir = path.join(__dirname, '../public/barcodes');
    if (!fs.existsSync(this.barcodeDir)) {
      fs.mkdirSync(this.barcodeDir, { recursive: true });
    }
  }

  /**
   * Generate barcode image and save to file
   * @param {string} text - Text to encode in barcode
   * @param {object} options - Barcode generation options
   * @returns {Promise<object>} - Generated barcode info
   */
  async generateBarcodeImage(text, options = {}) {
    try {
      const config = { ...this.defaultOptions, ...options };
      
      // Create canvas
      const canvas = createCanvas(400, 200);
      
      // Generate barcode
      JsBarcode(canvas, text, config);
      
      // Generate filename
      const filename = `barcode_${text}_${Date.now()}.png`;
      const filepath = path.join(this.barcodeDir, filename);
      
      // Save to file
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(filepath, buffer);
      
      return {
        success: true,
        filename,
        filepath,
        url: `/barcodes/${filename}`,
        text,
        format: config.format,
        size: buffer.length
      };
    } catch (error) {
      console.error('Error generating barcode:', error);
      throw new Error(`Failed to generate barcode: ${error.message}`);
    }
  }

  /**
   * Generate barcode as base64 string
   * @param {string} text - Text to encode in barcode
   * @param {object} options - Barcode generation options
   * @returns {Promise<string>} - Base64 encoded barcode image
   */
  async generateBarcodeBase64(text, options = {}) {
    try {
      const config = { ...this.defaultOptions, ...options };
      
      // Create canvas
      const canvas = createCanvas(400, 200);
      
      // Generate barcode
      JsBarcode(canvas, text, config);
      
      // Convert to base64
      const base64 = canvas.toDataURL('image/png');
      
      return {
        success: true,
        base64,
        text,
        format: config.format
      };
    } catch (error) {
      console.error('Error generating barcode base64:', error);
      throw new Error(`Failed to generate barcode: ${error.message}`);
    }
  }

  /**
   * Generate QR code image
   * @param {string} text - Text to encode in QR code
   * @param {object} options - QR code generation options
   * @returns {Promise<object>} - Generated QR code info
   */
  async generateQRCode(text, options = {}) {
    try {
      const config = {
        width: 200,
        height: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        ...options
      };
      
      // Generate QR code as buffer
      const qrBuffer = await QRCode.toBuffer(text, config);
      
      // Generate filename
      const filename = `qr_${Date.now()}.png`;
      const filepath = path.join(this.barcodeDir, filename);
      
      // Save to file
      fs.writeFileSync(filepath, qrBuffer);
      
      return {
        success: true,
        filename,
        filepath,
        url: `/barcodes/${filename}`,
        text,
        type: 'QR_CODE',
        size: qrBuffer.length
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate QR code as base64 string
   * @param {string} text - Text to encode in QR code
   * @param {object} options - QR code generation options
   * @returns {Promise<string>} - Base64 encoded QR code image
   */
  async generateQRCodeBase64(text, options = {}) {
    try {
      const config = {
        width: 200,
        height: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        ...options
      };
      
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(text, config);
      
      return {
        success: true,
        base64: qrDataUrl,
        text,
        type: 'QR_CODE'
      };
    } catch (error) {
      console.error('Error generating QR code base64:', error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Generate multiple barcodes for batch operations
   * @param {Array} products - Array of product objects with barcode text
   * @param {object} options - Barcode generation options
   * @returns {Promise<Array>} - Array of generated barcode info
   */
  async generateBatchBarcodes(products, options = {}) {
    try {
      const results = [];
      
      for (const product of products) {
        if (product.barcode) {
          const barcodeInfo = await this.generateBarcodeImage(product.barcode, options);
          results.push({
            productId: product._id,
            productName: product.name,
            ...barcodeInfo
          });
        }
      }
      
      return {
        success: true,
        count: results.length,
        barcodes: results
      };
    } catch (error) {
      console.error('Error generating batch barcodes:', error);
      throw new Error(`Failed to generate batch barcodes: ${error.message}`);
    }
  }

  /**
   * Validate barcode format
   * @param {string} text - Text to validate
   * @param {string} format - Barcode format to validate against
   * @returns {boolean} - Whether the text is valid for the format
   */
  validateBarcodeFormat(text, format = 'CODE128') {
    try {
      // Create a temporary canvas to test barcode generation
      const canvas = createCanvas(100, 100);
      JsBarcode(canvas, text, { format });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate auto barcode for product
   * @param {string} productId - Product ID
   * @param {string} sku - Product SKU
   * @param {string} prefix - Optional prefix for barcode
   * @returns {string} - Generated barcode string
   */
  generateAutoBarcode(productId, sku, prefix = '') {
    // Generate barcode using timestamp and product info
    const timestamp = Date.now().toString().slice(-8);
    const skuPart = sku.replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase();
    const idPart = productId.substring(productId.length - 4);
    
    const barcode = `${prefix}${skuPart}${idPart}${timestamp}`;
    
    // Ensure barcode is valid for CODE128
    return barcode.substring(0, 20); // Limit length for CODE128
  }

  /**
   * Clean up old barcode files
   * @param {number} olderThanDays - Delete files older than this many days
   */
  async cleanupOldBarcodes(olderThanDays = 30) {
    try {
      const files = fs.readdirSync(this.barcodeDir);
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      for (const file of files) {
        const filepath = path.join(this.barcodeDir, file);
        const stat = fs.statSync(filepath);
        
        if (stat.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filepath);
          deletedCount++;
        }
      }
      
      console.log(`Cleaned up ${deletedCount} old barcode files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up barcode files:', error);
      throw new Error(`Failed to cleanup barcode files: ${error.message}`);
    }
  }

  /**
   * Get barcode file info
   * @param {string} filename - Barcode filename
   * @returns {object} - File information
   */
  getBarcodeFileInfo(filename) {
    try {
      const filepath = path.join(this.barcodeDir, filename);
      
      if (!fs.existsSync(filepath)) {
        throw new Error('Barcode file not found');
      }
      
      const stat = fs.statSync(filepath);
      
      return {
        filename,
        filepath,
        url: `/barcodes/${filename}`,
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime
      };
    } catch (error) {
      console.error('Error getting barcode file info:', error);
      throw new Error(`Failed to get barcode file info: ${error.message}`);
    }
  }
}

module.exports = new BarcodeService();