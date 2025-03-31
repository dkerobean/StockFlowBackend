// controllers/reportController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Product = require('../models/Product'); // Needed for populating product details
const Location = require('../models/Location'); // Needed for populating location details

// --- PDF/Excel Generation Helpers (Consider moving to a separate utils/reportGenerators.js file) ---
const PdfPrinter = require('pdfmake');
const ExcelJS = require('exceljs');

// 1. Define font descriptors. These map logical font names/styles
//    to the actual font file names *expected* by pdfmake's internal VFS.
const fonts = {
    Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
    }
};

// 2. Import the virtual font file system. This populates pdfmake's internal VFS registry.
//    It needs to be required BEFORE the printer is created.
require('pdfmake/build/vfs_fonts.js'); // <--- Just require it to execute

// 3. Create the PdfPrinter instance with the font descriptors.
//    The printer will automatically look for the font files (like 'Roboto-Regular.ttf')
//    in the VFS populated by the require() call above.
const printer = new PdfPrinter(fonts);

// --- End CORRECTED Font Setup ---

// Helper function to generate PDF (No changes needed inside this function)
const generatePdf = (docDefinition, fileName, res) => {
    try {
        // The printer now uses the VFS populated by the require call above
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (error) {
        console.error("Error generating PDF:", error);
        // Ensure response is sent even on error
        if (!res.headersSent) {
            res.status(500).json({ message: "Error generating PDF report" });
        } else {
             // If headers already sent, just end the response abruptly
             res.end();
        }
    }
};

// Helper function to generate Excel (No changes needed inside this function)
const generateExcel = async (columns, data, fileName, sheetName, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName);
        worksheet.columns = columns;
        worksheet.addRows(data);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Error generating Excel:", error);
         // Ensure response is sent even on error
        if (!res.headersSent) {
             res.status(500).json({ message: "Error generating Excel report" });
         } else {
             res.end();
         }
    }
};
// --- End PDF/Excel Helpers ---


// Utility function to parse date filters
const getDateFilter = (startDate, endDate) => {
    const filter = {};
    if (startDate || endDate) {
        filter.createdAt = {}; // Assuming using timestamps. Adjust if using 'date' field
        if (startDate) {
            filter.createdAt.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        }
        if (endDate) {
            filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }
    }
    return filter;
};

// Utility function to apply location filtering based on user role
const applyLocationFilter = (filter, req, locationIdQueryParam = 'locationId') => {
    const locationId = req.query[locationIdQueryParam];

    if (locationId && !mongoose.Types.ObjectId.isValid(locationId)) {
        throw new Error('Invalid Location ID format'); // Will be caught by asyncHandler
    }

    // Admins see all unless a specific location is requested
    if (req.user.role === 'admin') {
        if (locationId) {
            filter.location = locationId;
        }
        // No location filter means all locations for admin
    } else {
        // Non-admins are restricted to their assigned locations
        const accessibleLocations = req.user.locations || [];
        if (accessibleLocations.length === 0) {
            // User has no locations assigned, they can't see any location-specific data
            filter.location = { $in: [] }; // Effectively returns nothing
            return false; // Indicate no access
        }

        if (locationId) {
            // If a specific location is requested, check if they have access
            if (!accessibleLocations.some(loc => loc.equals(locationId))) {
                 throw new Error('Forbidden: Access denied to this location'); // Will be caught
            }
            filter.location = locationId; // Filter by the requested (and accessible) location
        } else {
            // If no specific location requested, filter by all their accessible locations
            filter.location = { $in: accessibleLocations };
        }
    }
    return true; // Indicate access is potentially possible
};


// @desc    Get Stock Levels Report
// @route   GET /api/reports/stock-levels
// @access  Admin, Manager
exports.getStockLevelReport = asyncHandler(async (req, res) => {
    const { format = 'json', locationId, productId } = req.query; // format can be 'json', 'pdf', 'excel'

    const filter = {};
    if (productId) {
        if (!mongoose.Types.ObjectId.isValid(productId)) { res.status(400); throw new Error('Invalid Product ID'); }
        filter.product = productId;
    }

    // Apply location filter (using 'locationId' query param name)
    const hasAccess = applyLocationFilter(filter, req, 'locationId');
    if (!hasAccess && filter.location.$in?.length === 0) { // Check if filtering resulted in no locations
       if (format === 'json') return res.json([]);
       else return res.status(403).json({ message: 'No locations accessible for this report.'});
    }


    const inventoryList = await Inventory.find(filter)
        .populate('product', 'name sku price category isActive')
        .populate('location', 'name type isActive')
        .sort({ 'location.name': 1, 'product.name': 1 });

    // Prepare data for different formats
    const reportData = inventoryList.map(item => ({
        productName: item.product?.name || 'N/A',
        sku: item.product?.sku || 'N/A',
        category: item.product?.category || 'N/A',
        locationName: item.location?.name || 'N/A',
        locationType: item.location?.type || 'N/A',
        quantity: item.quantity,
        minStock: item.minStock,
        notifyAt: item.notifyAt,
        price: item.product?.price || 0, // Include price if needed
        productActive: item.product?.isActive ?? true,
        locationActive: item.location?.isActive ?? true,
    }));

    if (format === 'pdf') {
        const body = [
            ['Product', 'SKU', 'Location', 'Qty', 'Min Stock', 'Notify At'] // Headers
        ];
        reportData.forEach(item => {
            body.push([item.productName, item.sku, item.locationName, item.quantity, item.minStock, item.notifyAt]);
        });

        const docDefinition = {
            content: [
                { text: 'Stock Level Report', style: 'header' },
                { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 10] },
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: body
                    },
                    layout: 'lightHorizontalLines'
                }
            ],
            styles: { header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] } }
        };
        generatePdf(docDefinition, 'stock_level_report', res);

    } else if (format === 'excel') {
        const columns = [
            { header: 'Product', key: 'productName', width: 30 },
            { header: 'SKU', key: 'sku', width: 20 },
            { header: 'Category', key: 'category', width: 15 },
            { header: 'Location', key: 'locationName', width: 20 },
            { header: 'Location Type', key: 'locationType', width: 15 },
            { header: 'Quantity', key: 'quantity', width: 10 },
            { header: 'Min Stock', key: 'minStock', width: 10 },
            { header: 'Notify At', key: 'notifyAt', width: 10 },
            { header: 'Price', key: 'price', width: 10, style: { numFmt: '$#,##0.00' } },
            { header: 'Product Active', key: 'productActive', width: 10 },
            { header: 'Location Active', key: 'locationActive', width: 10 },
        ];
        await generateExcel(columns, reportData, 'stock_level_report', 'Stock Levels', res);

    } else { // Default to JSON
        res.json(inventoryList); // Send original populated data for JSON
    }
});

// @desc    Get Low Stock Report
// @route   GET /api/reports/low-stock
// @access  Admin, Manager
exports.getLowStockReport = asyncHandler(async (req, res) => {
    const { format = 'json', locationId } = req.query;

    const filter = {
         // Find where current quantity is less than or equal to the notifyAt threshold
        $expr: { $lte: ['$quantity', '$notifyAt'] }
    };

    // Apply location filter
    const hasAccess = applyLocationFilter(filter, req, 'locationId');
     if (!hasAccess && filter.location.$in?.length === 0) {
       if (format === 'json') return res.json([]);
       else return res.status(403).json({ message: 'No locations accessible for this report.'});
    }

    const lowStockItems = await Inventory.find(filter)
        .populate('product', 'name sku category isActive')
        .populate('location', 'name type isActive')
        .sort({ 'location.name': 1, 'product.name': 1 });

     // Prepare data for different formats
    const reportData = lowStockItems.map(item => ({
        productName: item.product?.name || 'N/A',
        sku: item.product?.sku || 'N/A',
        category: item.product?.category || 'N/A',
        locationName: item.location?.name || 'N/A',
        quantity: item.quantity,
        notifyAt: item.notifyAt,
        productActive: item.product?.isActive ?? true,
        locationActive: item.location?.isActive ?? true,
    }));

     if (format === 'pdf') {
        const body = [
            ['Product', 'SKU', 'Location', 'Qty', 'Notify At'] // Headers
        ];
        reportData.forEach(item => {
            body.push([item.productName, item.sku, item.locationName, item.quantity, item.notifyAt]);
        });
        const docDefinition = {
            content: [
                { text: 'Low Stock Report', style: 'header' },
                 { text: `Items at or below notification threshold. Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 10] },
                { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body: body }, layout: 'lightHorizontalLines' }
            ], styles: { header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] } }
        };
        generatePdf(docDefinition, 'low_stock_report', res);

    } else if (format === 'excel') {
        const columns = [
             { header: 'Product', key: 'productName', width: 30 },
             { header: 'SKU', key: 'sku', width: 20 },
             { header: 'Category', key: 'category', width: 15 },
             { header: 'Location', key: 'locationName', width: 20 },
             { header: 'Quantity', key: 'quantity', width: 10 },
             { header: 'Notify At', key: 'notifyAt', width: 10 },
             { header: 'Product Active', key: 'productActive', width: 10 },
             { header: 'Location Active', key: 'locationActive', width: 10 },
        ];
        await generateExcel(columns, reportData, 'low_stock_report', 'Low Stock', res);

    } else { // Default to JSON
        res.json(lowStockItems);
    }
});

// @desc    Get Sales Trend Report (Example: Total Sales per Day)
// @route   GET /api/reports/sales-trends
// @access  Admin, Manager
exports.getSalesTrendReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, locationId, format = 'json', groupBy = 'day' } = req.query; // groupBy can be 'day', 'month', 'year'

    const dateFilter = getDateFilter(startDate, endDate);
    const filter = { ...dateFilter };

     // Apply location filter
    const hasAccess = applyLocationFilter(filter, req, 'locationId');
     if (!hasAccess && filter.location?.$in?.length === 0) {
       if (format === 'json') return res.json([]);
       else return res.status(403).json({ message: 'No locations accessible for this report.'});
    }

    let groupFormat;
    switch (groupBy) {
        case 'month': groupFormat = '%Y-%m'; break;
        case 'year': groupFormat = '%Y'; break;
        case 'day':
        default: groupFormat = '%Y-%m-%d'; break;
    }

    const salesTrends = await Sale.aggregate([
        { $match: filter },
        {
            $group: {
                _id: { $dateToString: { format: groupFormat, date: "$createdAt", timezone: "UTC" } }, // Group by date string
                totalSalesAmount: { $sum: "$total" },
                numberOfSales: { $sum: 1 },
                totalItemsSold: { $sum: { $sum: "$items.quantity" } } // Sum quantities across all items in each sale
            }
        },
        { $sort: { _id: 1 } } // Sort by date ascending
    ]);

    // Prepare data for different formats
    const reportData = salesTrends.map(trend => ({
        period: trend._id,
        totalSalesAmount: parseFloat(trend.totalSalesAmount.toFixed(2)),
        numberOfSales: trend.numberOfSales,
        totalItemsSold: trend.totalItemsSold
    }));

    if (format === 'pdf') {
        const body = [
            ['Period', 'Total Sales', '# Sales', '# Items Sold'] // Headers
        ];
        reportData.forEach(item => {
            body.push([item.period, `$${item.totalSalesAmount.toFixed(2)}`, item.numberOfSales, item.totalItemsSold]);
        });
        const docDefinition = {
            content: [
                { text: `Sales Trends Report (Grouped by ${groupBy})`, style: 'header' },
                 { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 10] },
                 { text: `Filters: ${startDate || 'N/A'} to ${endDate || 'N/A'}${locationId ? `, Loc: ${locationId}` : ''}`, style: 'subheader'},
                { table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto'], body: body }, layout: 'lightHorizontalLines' }
            ], styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                subheader: { fontSize: 10, italics: true, margin: [0, 0, 0, 10] }
            }
        };
        generatePdf(docDefinition, 'sales_trends_report', res);

    } else if (format === 'excel') {
        const columns = [
             { header: 'Period', key: 'period', width: 15 },
             { header: 'Total Sales Amount', key: 'totalSalesAmount', width: 20, style: { numFmt: '$#,##0.00' } },
             { header: 'Number of Sales', key: 'numberOfSales', width: 15 },
             { header: 'Total Items Sold', key: 'totalItemsSold', width: 15 },
        ];
        await generateExcel(columns, reportData, 'sales_trends_report', 'Sales Trends', res);

    } else { // Default to JSON
        res.json(salesTrends); // Send aggregated data
    }
});

// @desc    Get Income Report
// @route   GET /api/reports/income
// @access  Admin, Manager
exports.getIncomeReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, source, format = 'json', groupBy = 'source' } = req.query; // groupBy can be 'source', 'date'

    // Note: Income model uses 'date' field, not 'createdAt' from timestamps for the actual income date
    const dateFilter = {};
     if (startDate || endDate) {
        dateFilter.date = {};
        if (startDate) dateFilter.date.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        if (endDate) dateFilter.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const filter = { ...dateFilter };
    if (source) filter.source = source;

    // Income doesn't directly link to Location in the default model, so location filtering isn't applied here.
    // If you added a 'location' field to Income (e.g., linking it from the relatedSale), you could add location filtering.

    let incomeData;
    if (groupBy === 'source') {
         incomeData = await Income.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$source',
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    } else { // Group by date (day)
         incomeData = await Income.aggregate([
            { $match: filter },
            {
                $group: {
                     _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    }


    const reportData = incomeData.map(item => ({
        group: item._id, // This is either source or date string
        totalAmount: parseFloat(item.totalAmount.toFixed(2)),
        count: item.count
    }));

    if (format === 'pdf') {
        const body = [
            [groupBy === 'source' ? 'Source' : 'Date', 'Total Amount', 'Count'] // Headers
        ];
        reportData.forEach(item => {
            body.push([item.group, `$${item.totalAmount.toFixed(2)}`, item.count]);
        });
        const docDefinition = {
            content: [
                { text: `Income Report (Grouped by ${groupBy})`, style: 'header' },
                { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 10] },
                { text: `Filters: ${startDate || 'N/A'} to ${endDate || 'N/A'}${source ? `, Source: ${source}` : ''}`, style: 'subheader'},
                { table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: body }, layout: 'lightHorizontalLines' }
            ], styles: {
                 header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                 subheader: { fontSize: 10, italics: true, margin: [0, 0, 0, 10] }
            }
        };
        generatePdf(docDefinition, 'income_report', res);

    } else if (format === 'excel') {
         const columns = [
             { header: groupBy === 'source' ? 'Source' : 'Date', key: 'group', width: 25 },
             { header: 'Total Amount', key: 'totalAmount', width: 20, style: { numFmt: '$#,##0.00' } },
             { header: 'Count', key: 'count', width: 15 },
        ];
        await generateExcel(columns, reportData, 'income_report', 'Income', res);
    } else {
        res.json(incomeData); // Send aggregated data
    }
});

// @desc    Get Expense Report
// @route   GET /api/reports/expenses
// @access  Admin, Manager
exports.getExpenseReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, category, format = 'json', groupBy = 'category' } = req.query; // groupBy can be 'category', 'date'

     // Expense model uses 'date' field
    const dateFilter = {};
     if (startDate || endDate) {
        dateFilter.date = {};
        if (startDate) dateFilter.date.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        if (endDate) dateFilter.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    const filter = { ...dateFilter };
    if (category) filter.category = category;

    // No location filter applicable unless added to Expense model

     let expenseData;
    if (groupBy === 'category') {
         expenseData = await Expense.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    } else { // Group by date (day)
         expenseData = await Expense.aggregate([
            { $match: filter },
            {
                $group: {
                     _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
    }

    const reportData = expenseData.map(item => ({
        group: item._id, // This is either category or date string
        totalAmount: parseFloat(item.totalAmount.toFixed(2)),
        count: item.count
    }));

    if (format === 'pdf') {
        const body = [
            [groupBy === 'category' ? 'Category' : 'Date', 'Total Amount', 'Count'] // Headers
        ];
        reportData.forEach(item => {
            body.push([item.group, `$${item.totalAmount.toFixed(2)}`, item.count]);
        });
        const docDefinition = {
            content: [
                { text: `Expense Report (Grouped by ${groupBy})`, style: 'header' },
                 { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 10] },
                 { text: `Filters: ${startDate || 'N/A'} to ${endDate || 'N/A'}${category ? `, Category: ${category}` : ''}`, style: 'subheader'},
                { table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: body }, layout: 'lightHorizontalLines' }
            ], styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                 subheader: { fontSize: 10, italics: true, margin: [0, 0, 0, 10] }
             }
        };
        generatePdf(docDefinition, 'expense_report', res);

    } else if (format === 'excel') {
         const columns = [
             { header: groupBy === 'category' ? 'Category' : 'Date', key: 'group', width: 25 },
             { header: 'Total Amount', key: 'totalAmount', width: 20, style: { numFmt: '$#,##0.00' } },
             { header: 'Count', key: 'count', width: 15 },
        ];
        await generateExcel(columns, reportData, 'expense_report', 'Expenses', res);
    } else {
        res.json(expenseData); // Send aggregated data
    }
});


// @desc    Get Profit & Loss Summary Report
// @route   GET /api/reports/profit-loss
// @access  Admin, Manager
exports.getProfitLossReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, format = 'json' } = req.query;

    // Use 'date' field for both Income and Expense
    const dateFilter = {};
     if (startDate || endDate) {
        dateFilter.date = {};
        if (startDate) dateFilter.date.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        if (endDate) dateFilter.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // No location filter here unless you add location to Income/Expense models.

    // Fetch total income
    const incomeResult = await Income.aggregate([
        { $match: dateFilter },
        { $group: { _id: null, totalIncome: { $sum: '$amount' } } }
    ]);
    const totalIncome = incomeResult.length > 0 ? incomeResult[0].totalIncome : 0;

    // Fetch total expenses
    const expenseResult = await Expense.aggregate([
        { $match: dateFilter },
        { $group: { _id: null, totalExpenses: { $sum: '$amount' } } }
    ]);
    const totalExpenses = expenseResult.length > 0 ? expenseResult[0].totalExpenses : 0;

    const profitLoss = totalIncome - totalExpenses;

    const reportData = {
        startDate: startDate || 'Start',
        endDate: endDate || 'End',
        totalIncome: parseFloat(totalIncome.toFixed(2)),
        totalExpenses: parseFloat(totalExpenses.toFixed(2)),
        profitLoss: parseFloat(profitLoss.toFixed(2)),
    };

    if (format === 'pdf') {
        const docDefinition = {
             content: [
                { text: 'Profit & Loss Summary Report', style: 'header' },
                 { text: `Period: ${reportData.startDate} to ${reportData.endDate}`, style: 'subheader'},
                 { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 20] },

                 { text: `Total Income: $${reportData.totalIncome.toFixed(2)}`, style: 'metric'},
                 { text: `Total Expenses: $${reportData.totalExpenses.toFixed(2)}`, style: 'metric'},
                 { text: `Net Profit / (Loss): $${reportData.profitLoss.toFixed(2)}`, style: 'metric', bold: true, color: reportData.profitLoss >= 0 ? 'green' : 'red' }
            ], styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
                 subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 10] },
                 metric: { fontSize: 14, margin: [0, 5, 0, 5] }
             }
        };
        generatePdf(docDefinition, 'profit_loss_summary', res);

    } else if (format === 'excel') {
        const columns = [
             { header: 'Metric', key: 'metric', width: 25 },
             { header: 'Amount', key: 'amount', width: 20, style: { numFmt: '$#,##0.00' } },
        ];
        const excelData = [
            { metric: 'Start Date', amount: reportData.startDate },
            { metric: 'End Date', amount: reportData.endDate },
            { metric: 'Total Income', amount: reportData.totalIncome },
            { metric: 'Total Expenses', amount: reportData.totalExpenses },
            { metric: 'Net Profit / (Loss)', amount: reportData.profitLoss },
        ];
         // Customize formatting for dates if needed
        await generateExcel(columns, excelData, 'profit_loss_summary', 'Profit Loss', res);
    } else {
        res.json(reportData);
    }
});