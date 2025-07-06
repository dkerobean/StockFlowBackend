// controllers/reportController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Product = require('../models/Product');
const Location = require('../models/Location');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');

// --- PDF/Excel Generation Helpers
const PdfPrinter = require('pdfmake');
const ExcelJS = require('exceljs');

// 1. Define font descriptors.
const fonts = {
    Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
    }
};

// 2. Import the virtual font file system.
require('pdfmake/build/vfs_fonts.js');

// 3. Create the PdfPrinter instance with the font descriptors.
const printer = new PdfPrinter(fonts);

// Helper function to generate PDF
const generatePdf = (docDefinition, fileName, res) => {
    try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (error) {
        console.error("Error generating PDF:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Error generating PDF report" });
        } else {
             res.end();
        }
    }
};

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
        throw new Error('Invalid Location ID format'); 
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

// @desc    Get Comprehensive Expense Report
// @route   GET /api/reports/expenses
// @access  Protected (Manager/Admin)
exports.getExpenseReport = asyncHandler(async (req, res) => {
    const { 
        format = 'json', 
        page = 1, 
        limit = 25,
        startDate,
        endDate,
        category,
        paymentMethod,
        search,
        minAmount,
        maxAmount,
        sortBy = 'date',
        sortOrder = 'desc'
    } = req.query;

    console.log('🚀 Starting expense report generation...');
    
    try {
        // Base aggregation pipeline
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        // Build match filters
        const matchFilters = {};

        // Date range filter
        if (startDate || endDate) {
            matchFilters.date = {};
            if (startDate) {
                matchFilters.date.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
            }
            if (endDate) {
                matchFilters.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
            }
        }

        // Category filter
        if (category) {
            matchFilters.category = category;
        }

        // Payment method filter
        if (paymentMethod) {
            matchFilters.paymentMethod = paymentMethod;
        }

        // Amount range filter
        if (minAmount || maxAmount) {
            matchFilters.amount = {};
            if (minAmount) {
                matchFilters.amount.$gte = parseFloat(minAmount);
            }
            if (maxAmount) {
                matchFilters.amount.$lte = parseFloat(maxAmount);
            }
        }

        // Search filter
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            matchFilters.$or = [
                { description: searchRegex },
                { notes: searchRegex },
                { 'supplier.name': searchRegex },
                { category: searchRegex }
            ];
        }

        // Add match stage if we have filters
        if (Object.keys(matchFilters).length > 0) {
            pipeline.push({ $match: matchFilters });
        }

        // Create facet for summary statistics and main data
        const facetPipeline = {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            totalExpenses: { $sum: 1 },
                            totalAmount: { $sum: '$amount' },
                            avgAmount: { $avg: '$amount' },
                            minAmount: { $min: '$amount' },
                            maxAmount: { $max: '$amount' },
                            categoryBreakdown: {
                                $push: {
                                    category: '$category',
                                    amount: '$amount'
                                }
                            },
                            paymentMethodBreakdown: {
                                $push: {
                                    method: '$paymentMethod',
                                    amount: '$amount'
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            topCategory: {
                                $arrayElemAt: [
                                    {
                                        $map: {
                                            input: {
                                                $slice: [
                                                    {
                                                        $sortArray: {
                                                            input: {
                                                                $reduce: {
                                                                    input: '$categoryBreakdown',
                                                                    initialValue: [],
                                                                    in: {
                                                                        $let: {
                                                                            vars: {
                                                                                existing: {
                                                                                    $filter: {
                                                                                        input: '$$value',
                                                                                        cond: { $eq: ['$$this.category', '$$this.category'] }
                                                                                    }
                                                                                }
                                                                            },
                                                                            in: {
                                                                                $cond: [
                                                                                    { $gt: [{ $size: '$$existing' }, 0] },
                                                                                    {
                                                                                        $map: {
                                                                                            input: '$$value',
                                                                                            in: {
                                                                                                $cond: [
                                                                                                    { $eq: ['$$this.category', '$$this.category'] },
                                                                                                    {
                                                                                                        category: '$$this.category',
                                                                                                        total: { $add: ['$$this.total', '$$this.amount'] }
                                                                                                    },
                                                                                                    '$$this'
                                                                                                ]
                                                                                            }
                                                                                        }
                                                                                    },
                                                                                    {
                                                                                        $concatArrays: [
                                                                                            '$$value',
                                                                                            [{
                                                                                                category: '$$this.category',
                                                                                                total: '$$this.amount'
                                                                                            }]
                                                                                        ]
                                                                                    }
                                                                                ]
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            },
                                                            sortBy: { total: -1 }
                                                        }
                                                    },
                                                    1
                                                ]
                                            },
                                            as: 'item',
                                            in: '$$item.category'
                                        }
                                    },
                                    0
                                ]
                            }
                        }
                    }
                ],
                data: [
                    {
                        $project: {
                            _id: 1,
                            description: 1,
                            category: 1,
                            amount: 1,
                            date: 1,
                            paymentMethod: 1,
                            supplier: 1,
                            notes: 1,
                            receiptUrl: 1,
                            createdBy: '$userInfo.name',
                            createdAt: 1,
                            updatedAt: 1
                        }
                    }
                ]
            }
        };

        pipeline.push(facetPipeline);

        // Execute aggregation
        console.log('📊 Executing expense aggregation...');
        const result = await Expense.aggregate(pipeline);
        
        const summaryData = result[0]?.summary[0] || {};
        let expenseData = result[0]?.data || [];

        // Handle sorting
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        const sortField = sortBy === 'date' ? 'date' : 
                         sortBy === 'amount' ? 'amount' :
                         sortBy === 'category' ? 'category' :
                         sortBy === 'description' ? 'description' : 'date';

        expenseData.sort((a, b) => {
            const aVal = a[sortField] || '';
            const bVal = b[sortField] || '';
            
            if (sortField === 'date') {
                return sortDirection * (new Date(aVal) - new Date(bVal));
            } else if (typeof aVal === 'string') {
                return sortDirection * aVal.localeCompare(bVal);
            }
            return sortDirection * (aVal - bVal);
        });

        // Handle pagination for JSON response
        const totalCount = expenseData.length;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const paginatedData = expenseData.slice(skip, skip + parseInt(limit));

        const summary = {
            totalExpenses: summaryData.totalExpenses || 0,
            totalAmount: summaryData.totalAmount || 0,
            avgAmount: summaryData.avgAmount || 0,
            minAmount: summaryData.minAmount || 0,
            maxAmount: summaryData.maxAmount || 0,
            topCategory: summaryData.topCategory || 'N/A'
        };

        console.log('✅ Expense report generated successfully');

        // Handle different output formats
        if (format === 'pdf') {
            const reportData = expenseData.map(expense => ({
                date: new Date(expense.date).toLocaleDateString(),
                description: expense.description || 'N/A',
                category: expense.category || 'N/A',
                amount: expense.amount || 0,
                paymentMethod: expense.paymentMethod || 'N/A',
                createdBy: expense.createdBy || 'N/A',
                notes: expense.notes || ''
            }));

            const body = [
                ['Date', 'Description', 'Category', 'Amount', 'Payment Method', 'Created By', 'Notes']
            ];

            reportData.forEach(expense => {
                body.push([
                    expense.date,
                    expense.description,
                    expense.category,
                    `$${expense.amount.toFixed(2)}`,
                    expense.paymentMethod,
                    expense.createdBy,
                    expense.notes
                ]);
            });

            // Add summary row
            body.push(['', '', '', '', '', '', '']);
            body.push(['SUMMARY', `Total: ${summary.totalExpenses}`, `Amount: $${summary.totalAmount.toFixed(2)}`, `Avg: $${summary.avgAmount.toFixed(2)}`, `Top Category: ${summary.topCategory}`, '', '']);

            const docDefinition = {
                content: [
                    { text: 'Expense Report', style: 'header' },
                    { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 5] },
                    { text: `Total Expenses: ${summary.totalExpenses} | Total Amount: $${summary.totalAmount.toFixed(2)}`, style: 'subheader' },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', '*'],
                            body: body
                        },
                        layout: 'lightHorizontalLines'
                    }
                ],
                styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                    subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 15] }
                }
            };
            generatePdf(docDefinition, 'expense_report', res);

        } else if (format === 'excel') {
            const reportData = expenseData.map(expense => ({
                date: new Date(expense.date).toLocaleDateString(),
                description: expense.description || 'N/A',
                category: expense.category || 'N/A',
                amount: expense.amount || 0,
                paymentMethod: expense.paymentMethod || 'N/A',
                supplierName: expense.supplier?.name || 'N/A',
                createdBy: expense.createdBy || 'N/A',
                notes: expense.notes || '',
                receiptUrl: expense.receiptUrl || '',
                createdAt: expense.createdAt ? new Date(expense.createdAt).toLocaleDateString() : 'N/A'
            }));

            const columns = [
                { header: 'Date', key: 'date', width: 12 },
                { header: 'Description', key: 'description', width: 30 },
                { header: 'Category', key: 'category', width: 15 },
                { header: 'Amount', key: 'amount', width: 12, style: { numFmt: '$#,##0.00' } },
                { header: 'Payment Method', key: 'paymentMethod', width: 15 },
                { header: 'Supplier', key: 'supplierName', width: 20 },
                { header: 'Created By', key: 'createdBy', width: 15 },
                { header: 'Notes', key: 'notes', width: 30 },
                { header: 'Receipt URL', key: 'receiptUrl', width: 25 },
                { header: 'Created At', key: 'createdAt', width: 12 }
            ];
            await generateExcel(columns, reportData, 'expense_report', 'Expense Report', res);

        } else { // Default to JSON
            const pagination = {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalRecords: totalCount,
                limit: parseInt(limit)
            };

            res.json({
                expenses: paginatedData,
                summary,
                pagination
            });
        }

    } catch (error) {
        console.error('❌ Error generating expense report:', error);
        res.status(500);
        throw new Error(`Failed to generate expense report: ${error.message}`);
    }
});

// @desc    Get Sales Report
// @route   GET /api/reports/sales
// @access  Admin, Manager
exports.getSalesReport = asyncHandler(async (req, res) => {
    const { 
        startDate, 
        endDate, 
        locationId, 
        customerId, 
        status, 
        paymentMethod,
        format = 'json',
        limit = 100,
        page = 1
    } = req.query;

    // Build filter
    const filter = {};
    
    // Date filter using createdAt (sales timestamp)
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
            filter.createdAt.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        }
        if (endDate) {
            filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }
    }

    // Apply location filter with role-based access
    const hasAccess = applyLocationFilter(filter, req, 'locationId');
    if (!hasAccess && filter.location?.$in?.length === 0) {
        if (format === 'json') return res.json({ sales: [], summary: {}, pagination: {} });
        else return res.status(403).json({ message: 'No locations accessible for this report.' });
    }

    // Additional filters
    if (customerId) {
        if (!mongoose.Types.ObjectId.isValid(customerId)) {
            res.status(400);
            throw new Error('Invalid Customer ID format');
        }
        filter.customer = customerId;
    }
    
    if (status) {
        filter.status = status;
    }
    
    if (paymentMethod) {
        filter.paymentMethod = paymentMethod;
    }

    // For pagination (only applies to JSON format)
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count for pagination
    const totalCount = await Sale.countDocuments(filter);

    // Fetch sales data
    let salesQuery = Sale.find(filter)
        .populate('customer', 'name email phone type')
        .populate('location', 'name type')
        .populate('items.product', 'name sku')
        .sort({ createdAt: -1 });

    // Apply pagination only for JSON format
    if (format === 'json') {
        salesQuery = salesQuery.skip(skip).limit(parseInt(limit));
    }

    const sales = await salesQuery;

    // Calculate summary statistics
    const summaryData = await Sale.aggregate([
        { $match: filter },
        {
            $group: {
                _id: null,
                totalSales: { $sum: 1 },
                totalRevenue: { $sum: '$total' },
                totalItemsSold: { $sum: { $sum: '$items.quantity' } },
                avgOrderValue: { $avg: '$total' }
            }
        }
    ]);

    const summary = summaryData.length > 0 ? {
        totalSales: summaryData[0].totalSales,
        totalRevenue: parseFloat(summaryData[0].totalRevenue.toFixed(2)),
        totalItemsSold: summaryData[0].totalItemsSold,
        avgOrderValue: parseFloat(summaryData[0].avgOrderValue.toFixed(2))
    } : {
        totalSales: 0,
        totalRevenue: 0,
        totalItemsSold: 0,
        avgOrderValue: 0
    };

    // Prepare data for export formats
    const reportData = sales.map(sale => ({
        saleId: sale.saleId || sale._id,
        date: sale.createdAt.toLocaleDateString(),
        customerName: sale.customer?.name || 'Walk-in Customer',
        customerType: sale.customer?.type || 'Individual',
        locationName: sale.location?.name || 'N/A',
        itemsCount: sale.items.length,
        totalQuantity: sale.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: parseFloat(sale.subtotal?.toFixed(2) || 0),
        tax: parseFloat(sale.tax?.toFixed(2) || 0),
        discount: parseFloat(sale.discount?.toFixed(2) || 0),
        total: parseFloat(sale.total.toFixed(2)),
        paymentMethod: sale.paymentMethod || 'N/A',
        status: sale.status || 'completed',
        notes: sale.notes || ''
    }));

    if (format === 'pdf') {
        const body = [
            ['Sale ID', 'Date', 'Customer', 'Location', 'Items', 'Total', 'Payment', 'Status']
        ];
        reportData.forEach(sale => {
            body.push([
                sale.saleId,
                sale.date,
                sale.customerName,
                sale.locationName,
                sale.itemsCount,
                `$${sale.total}`,
                sale.paymentMethod,
                sale.status
            ]);
        });

        // Add summary row
        body.push(['', '', '', '', '', '', '', '']);
        body.push(['SUMMARY', '', `Sales: ${summary.totalSales}`, `Revenue: $${summary.totalRevenue}`, `Items: ${summary.totalItemsSold}`, `Avg: $${summary.avgOrderValue}`, '', '']);

        const docDefinition = {
            content: [
                { text: 'Sales Report', style: 'header' },
                { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 5] },
                { text: `Period: ${startDate || 'All'} to ${endDate || 'All'}`, style: 'subheader' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: body
                    },
                    layout: 'lightHorizontalLines'
                }
            ],
            styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 15] }
            }
        };
        generatePdf(docDefinition, 'sales_report', res);

    } else if (format === 'excel') {
        const columns = [
            { header: 'Sale ID', key: 'saleId', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Customer', key: 'customerName', width: 25 },
            { header: 'Customer Type', key: 'customerType', width: 15 },
            { header: 'Location', key: 'locationName', width: 20 },
            { header: 'Items Count', key: 'itemsCount', width: 12 },
            { header: 'Total Quantity', key: 'totalQuantity', width: 15 },
            { header: 'Subtotal', key: 'subtotal', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Tax', key: 'tax', width: 10, style: { numFmt: '$#,##0.00' } },
            { header: 'Discount', key: 'discount', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Total', key: 'total', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Payment Method', key: 'paymentMethod', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Notes', key: 'notes', width: 30 }
        ];
        await generateExcel(columns, reportData, 'sales_report', 'Sales Report', res);

    } else { // Default to JSON
        const pagination = {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalRecords: totalCount,
            limit: parseInt(limit)
        };

        res.json({
            sales,
            summary,
            pagination
        });
    }
});


// @desc    Get Comprehensive Profit & Loss Report
// @route   GET /api/reports/profit-loss
// @access  Admin, Manager
exports.getProfitLossReport = asyncHandler(async (req, res) => {
    const { 
        startDate, 
        endDate, 
        format = 'json',
        page = 1,
        limit = 25,
        includeDetails = false,
        groupBy = 'total', // 'total', 'monthly', 'source', 'category'
        search
    } = req.query;

    console.log('🔍 Profit & Loss Report request:', { startDate, endDate, format, page, limit, includeDetails, groupBy, search });

    // Build date filter using 'date' field for both Income and Expense
    const dateFilter = {};
    if (startDate || endDate) {
        dateFilter.date = {};
        if (startDate) dateFilter.date.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        if (endDate) dateFilter.date.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    console.log('📅 Date filter:', dateFilter);

    try {
        // Build comprehensive aggregation pipelines
        const incomeAggregation = [
            { $match: dateFilter },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalIncome: { $sum: '$amount' },
                                totalTransactions: { $sum: 1 },
                                avgAmount: { $avg: '$amount' }
                            }
                        }
                    ],
                    bySource: [
                        {
                            $group: {
                                _id: '$source',
                                amount: { $sum: '$amount' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { amount: -1 } }
                    ],
                    monthly: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$date' },
                                    month: { $month: '$date' }
                                },
                                amount: { $sum: '$amount' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { '_id.year': 1, '_id.month': 1 } }
                    ]
                }
            }
        ];

        const expenseAggregation = [
            { $match: dateFilter },
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalExpenses: { $sum: '$amount' },
                                totalTransactions: { $sum: 1 },
                                avgAmount: { $avg: '$amount' }
                            }
                        }
                    ],
                    byCategory: [
                        {
                            $group: {
                                _id: '$category',
                                amount: { $sum: '$amount' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { amount: -1 } }
                    ],
                    monthly: [
                        {
                            $group: {
                                _id: {
                                    year: { $year: '$date' },
                                    month: { $month: '$date' }
                                },
                                amount: { $sum: '$amount' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { '_id.year': 1, '_id.month': 1 } }
                    ]
                }
            }
        ];

        // Execute aggregations in parallel
        const [incomeResults, expenseResults] = await Promise.all([
            Income.aggregate(incomeAggregation),
            Expense.aggregate(expenseAggregation)
        ]);

        console.log('📊 Aggregation results:', {
            incomeResults: incomeResults[0],
            expenseResults: expenseResults[0]
        });

        // Extract summary data
        const incomeSummary = incomeResults[0]?.summary[0] || { totalIncome: 0, totalTransactions: 0, avgAmount: 0 };
        const expenseSummary = expenseResults[0]?.summary[0] || { totalExpenses: 0, totalTransactions: 0, avgAmount: 0 };

        // Calculate profit/loss metrics
        const totalIncome = incomeSummary.totalIncome || 0;
        const totalExpenses = expenseSummary.totalExpenses || 0;
        const netProfitLoss = totalIncome - totalExpenses;
        const profitMargin = totalIncome > 0 ? ((netProfitLoss / totalIncome) * 100) : 0;

        // Build summary object
        const summary = {
            totalIncome: parseFloat(totalIncome.toFixed(2)),
            totalExpenses: parseFloat(totalExpenses.toFixed(2)),
            netProfitLoss: parseFloat(netProfitLoss.toFixed(2)),
            profitMargin: parseFloat(profitMargin.toFixed(2)),
            incomeTransactions: incomeSummary.totalTransactions || 0,
            expenseTransactions: expenseSummary.totalTransactions || 0,
            avgIncomeAmount: parseFloat((incomeSummary.avgAmount || 0).toFixed(2)),
            avgExpenseAmount: parseFloat((expenseSummary.avgAmount || 0).toFixed(2)),
            isProfitable: netProfitLoss >= 0,
            topIncomeSource: incomeResults[0]?.bySource[0]?._id || 'N/A',
            topExpenseCategory: expenseResults[0]?.byCategory[0]?._id || 'N/A'
        };

        // Build breakdown data
        const breakdown = {
            incomeBySource: incomeResults[0]?.bySource?.map(item => ({
                source: item._id,
                amount: parseFloat(item.amount.toFixed(2)),
                count: item.count,
                percentage: totalIncome > 0 ? parseFloat(((item.amount / totalIncome) * 100).toFixed(2)) : 0
            })) || [],
            expensesByCategory: expenseResults[0]?.byCategory?.map(item => ({
                category: item._id,
                amount: parseFloat(item.amount.toFixed(2)),
                count: item.count,
                percentage: totalExpenses > 0 ? parseFloat(((item.amount / totalExpenses) * 100).toFixed(2)) : 0
            })) || [],
            monthlyData: []
        };

        // Build monthly comparison data
        const monthlyIncome = incomeResults[0]?.monthly || [];
        const monthlyExpenses = expenseResults[0]?.monthly || [];
        
        // Merge monthly data
        const monthlyMap = new Map();
        
        monthlyIncome.forEach(item => {
            const key = `${item._id.year}-${item._id.month}`;
            monthlyMap.set(key, {
                year: item._id.year,
                month: item._id.month,
                income: parseFloat(item.amount.toFixed(2)),
                expenses: 0,
                netProfit: 0
            });
        });

        monthlyExpenses.forEach(item => {
            const key = `${item._id.year}-${item._id.month}`;
            const existing = monthlyMap.get(key) || {
                year: item._id.year,
                month: item._id.month,
                income: 0,
                expenses: 0,
                netProfit: 0
            };
            existing.expenses = parseFloat(item.amount.toFixed(2));
            monthlyMap.set(key, existing);
        });

        // Calculate net profit for each month and sort
        breakdown.monthlyData = Array.from(monthlyMap.values())
            .map(item => ({
                ...item,
                netProfit: parseFloat((item.income - item.expenses).toFixed(2))
            }))
            .sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return a.month - b.month;
            });

        // Handle detailed transactions if requested
        let transactions = [];
        let pagination = {};

        if (includeDetails === 'true' || format !== 'json') {
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            // Get detailed transactions with search filter
            let incomeFilter = { ...dateFilter };
            let expenseFilter = { ...dateFilter };
            
            if (search) {
                const searchRegex = new RegExp(search, 'i');
                incomeFilter.$or = [
                    { description: searchRegex },
                    { source: searchRegex },
                    { notes: searchRegex }
                ];
                expenseFilter.$or = [
                    { description: searchRegex },
                    { category: searchRegex },
                    { notes: searchRegex }
                ];
            }

            const [incomeTransactions, expenseTransactions, incomeCount, expenseCount] = await Promise.all([
                Income.find(incomeFilter)
                    .populate('createdBy', 'name')
                    .populate('relatedSale', '_id saleId')
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(parseInt(limit) / 2),
                Expense.find(expenseFilter)
                    .populate('createdBy', 'name')
                    .sort({ date: -1 })
                    .skip(skip)
                    .limit(parseInt(limit) / 2),
                Income.countDocuments(incomeFilter),
                Expense.countDocuments(expenseFilter)
            ]);

            // Combine and sort transactions
            const allTransactions = [
                ...incomeTransactions.map(income => ({
                    _id: income._id,
                    type: 'income',
                    date: income.date,
                    description: income.description,
                    amount: income.amount,
                    source: income.source,
                    category: income.source, // For consistent interface
                    relatedSale: income.relatedSale,
                    createdBy: income.createdBy,
                    notes: income.notes
                })),
                ...expenseTransactions.map(expense => ({
                    _id: expense._id,
                    type: 'expense',
                    date: expense.date,
                    description: expense.description,
                    amount: -expense.amount, // Negative for expenses
                    source: null,
                    category: expense.category,
                    paymentMethod: expense.paymentMethod,
                    supplier: expense.supplier,
                    createdBy: expense.createdBy,
                    notes: expense.notes
                }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date));

            transactions = allTransactions.slice(0, parseInt(limit));

            pagination = {
                currentPage: parseInt(page),
                totalPages: Math.ceil((incomeCount + expenseCount) / parseInt(limit)),
                totalRecords: incomeCount + expenseCount,
                limit: parseInt(limit)
            };
        }

        // Prepare response data
        const reportData = {
            period: {
                startDate: startDate || null,
                endDate: endDate || null,
                generatedAt: new Date().toISOString()
            },
            summary,
            breakdown,
            ...(includeDetails === 'true' && { transactions, pagination })
        };

        // Handle different output formats
        if (format === 'pdf') {
            const body = [
                ['Metric', 'Amount', 'Details']
            ];

            // Add summary rows
            body.push(['Total Income', `$${summary.totalIncome.toFixed(2)}`, `${summary.incomeTransactions} transactions`]);
            body.push(['Total Expenses', `$${summary.totalExpenses.toFixed(2)}`, `${summary.expenseTransactions} transactions`]);
            body.push(['Net Profit/Loss', `$${summary.netProfitLoss.toFixed(2)}`, `${summary.profitMargin.toFixed(2)}% margin`]);
            body.push(['', '', '']);

            // Add income breakdown
            body.push(['INCOME BY SOURCE', '', '']);
            breakdown.incomeBySource.forEach(item => {
                body.push([item.source, `$${item.amount.toFixed(2)}`, `${item.percentage.toFixed(1)}%`]);
            });
            body.push(['', '', '']);

            // Add expense breakdown
            body.push(['EXPENSES BY CATEGORY', '', '']);
            breakdown.expensesByCategory.forEach(item => {
                body.push([item.category, `$${item.amount.toFixed(2)}`, `${item.percentage.toFixed(1)}%`]);
            });

            const docDefinition = {
                content: [
                    { text: 'Comprehensive Profit & Loss Report', style: 'header' },
                    { text: `Period: ${startDate || 'All'} to ${endDate || 'All'}`, style: 'subheader' },
                    { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 15] },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', 'auto', '*'],
                            body: body
                        },
                        layout: 'lightHorizontalLines'
                    }
                ],
                styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                    subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 15] }
                }
            };
            generatePdf(docDefinition, 'comprehensive_profit_loss_report', res);

        } else if (format === 'excel') {
            const columns = [
                { header: 'Metric', key: 'metric', width: 30 },
                { header: 'Amount', key: 'amount', width: 15, style: { numFmt: '$#,##0.00' } },
                { header: 'Details', key: 'details', width: 25 }
            ];

            const excelData = [
                { metric: 'Period Start', amount: startDate || 'All', details: '' },
                { metric: 'Period End', amount: endDate || 'All', details: '' },
                { metric: '', amount: '', details: '' },
                { metric: 'Total Income', amount: summary.totalIncome, details: `${summary.incomeTransactions} transactions` },
                { metric: 'Total Expenses', amount: summary.totalExpenses, details: `${summary.expenseTransactions} transactions` },
                { metric: 'Net Profit/Loss', amount: summary.netProfitLoss, details: `${summary.profitMargin.toFixed(2)}% margin` },
                { metric: '', amount: '', details: '' },
                { metric: 'INCOME BREAKDOWN', amount: '', details: '' },
                ...breakdown.incomeBySource.map(item => ({
                    metric: item.source,
                    amount: item.amount,
                    details: `${item.percentage.toFixed(1)}%`
                })),
                { metric: '', amount: '', details: '' },
                { metric: 'EXPENSE BREAKDOWN', amount: '', details: '' },
                ...breakdown.expensesByCategory.map(item => ({
                    metric: item.category,
                    amount: item.amount,
                    details: `${item.percentage.toFixed(1)}%`
                }))
            ];

            await generateExcel(columns, excelData, 'comprehensive_profit_loss_report', 'Profit & Loss', res);

        } else {
            // Return JSON response
            res.json(reportData);
        }

    } catch (error) {
        console.error('❌ Error generating profit & loss report:', error);
        res.status(500).json({ 
            message: 'Error generating profit & loss report',
            error: error.message 
        });
    }
});

// @desc    Get Purchase Report
// @route   GET /api/reports/purchases
// @access  Admin, Manager
exports.getPurchaseReport = asyncHandler(async (req, res) => {
    const { 
        startDate, 
        endDate, 
        locationId, 
        supplierId, 
        status, 
        paymentStatus,
        format = 'json',
        limit = 100,
        page = 1
    } = req.query;

    // Build filter
    const filter = {};
    
    // Date filter using purchaseDate
    if (startDate || endDate) {
        filter.purchaseDate = {};
        if (startDate) {
            filter.purchaseDate.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
        }
        if (endDate) {
            filter.purchaseDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
        }
    }

    // Apply location filter with role-based access (using warehouse field)
    if (locationId) {
        if (!mongoose.Types.ObjectId.isValid(locationId)) {
            res.status(400);
            throw new Error('Invalid Location ID format');
        }
        filter.warehouse = locationId;
    }

    // Apply role-based location filtering for non-admin users
    // Note: Admin users have full access regardless of their locations array
    if (req.user.role !== 'admin') {
        const accessibleLocations = req.user.locations || [];
        if (accessibleLocations.length === 0) {
            if (format === 'json') return res.json({ purchases: [], summary: {}, pagination: {} });
            else return res.status(403).json({ message: 'No locations accessible for this report.' });
        }
        
        if (!locationId) {
            // For non-admin users, filter by accessible locations (including purchases without warehouse)
            filter.$or = [
                { warehouse: { $in: accessibleLocations } },
                { warehouse: { $exists: false } },
                { warehouse: null }
            ];
        } else {
            // Check if requested location is accessible
            if (!accessibleLocations.some(loc => loc.equals(locationId))) {
                if (format === 'json') return res.json({ purchases: [], summary: {}, pagination: {} });
                else return res.status(403).json({ message: 'Access denied to this location.' });
            }
            filter.warehouse = locationId;
        }
    }

    // Additional filters
    if (supplierId) {
        if (!mongoose.Types.ObjectId.isValid(supplierId)) {
            res.status(400);
            throw new Error('Invalid Supplier ID format');
        }
        filter.supplier = supplierId;
    }
    
    if (status) {
        filter.status = status;
    }
    
    if (paymentStatus) {
        filter.paymentStatus = paymentStatus;
    }

    // Only show active purchases
    filter.isActive = true;

    // For pagination (only applies to JSON format)
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count for pagination
    const totalCount = await Purchase.countDocuments(filter);

    // Fetch purchases data
    let purchaseQuery = Purchase.find(filter)
        .populate('supplier', 'supplierName email phone code')
        .populate({
            path: 'warehouse',
            select: 'name type',
            options: { strictPopulate: false } // Allow null/missing references
        })
        .populate('items.product', 'name sku')
        .populate('createdBy', 'name email')
        .sort({ purchaseDate: -1 });

    // Apply pagination only for JSON format
    if (format === 'json') {
        purchaseQuery = purchaseQuery.skip(skip).limit(parseInt(limit));
    }

    const purchases = await purchaseQuery;

    // Calculate summary statistics
    const summaryData = await Purchase.aggregate([
        { $match: filter },
        {
            $group: {
                _id: null,
                totalPurchases: { $sum: 1 },
                totalAmount: { $sum: '$grandTotal' },
                totalItemsOrdered: { $sum: { $sum: '$items.quantity' } },
                avgOrderValue: { $avg: '$grandTotal' },
                totalPaid: { $sum: '$amountPaid' },
                totalDue: { $sum: '$amountDue' }
            }
        }
    ]);

    // Calculate status breakdown
    const statusBreakdown = await Purchase.aggregate([
        { $match: filter },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$grandTotal' }
            }
        }
    ]);

    // Calculate payment status breakdown
    const paymentBreakdown = await Purchase.aggregate([
        { $match: filter },
        {
            $group: {
                _id: '$paymentStatus',
                count: { $sum: 1 },
                totalAmount: { $sum: '$grandTotal' }
            }
        }
    ]);

    const summary = summaryData.length > 0 ? {
        totalPurchases: summaryData[0].totalPurchases,
        totalAmount: parseFloat(summaryData[0].totalAmount.toFixed(2)),
        totalItemsOrdered: summaryData[0].totalItemsOrdered,
        avgOrderValue: parseFloat(summaryData[0].avgOrderValue.toFixed(2)),
        totalPaid: parseFloat(summaryData[0].totalPaid.toFixed(2)),
        totalDue: parseFloat(summaryData[0].totalDue.toFixed(2)),
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
            acc[item._id] = { count: item.count, totalAmount: parseFloat(item.totalAmount.toFixed(2)) };
            return acc;
        }, {}),
        paymentBreakdown: paymentBreakdown.reduce((acc, item) => {
            acc[item._id] = { count: item.count, totalAmount: parseFloat(item.totalAmount.toFixed(2)) };
            return acc;
        }, {})
    } : {
        totalPurchases: 0,
        totalAmount: 0,
        totalItemsOrdered: 0,
        avgOrderValue: 0,
        totalPaid: 0,
        totalDue: 0,
        statusBreakdown: {},
        paymentBreakdown: {}
    };

    // Prepare data for export formats
    const reportData = purchases.map(purchase => ({
        purchaseNumber: purchase.purchaseNumber || purchase._id,
        purchaseDate: purchase.purchaseDate.toLocaleDateString(),
        supplierName: purchase.supplier?.supplierName || 'N/A',
        supplierEmail: purchase.supplier?.email || 'N/A',
        warehouseName: purchase.warehouse?.name || 'No Warehouse Assigned',
        itemsCount: purchase.items.length,
        totalQuantity: purchase.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: parseFloat(purchase.subtotal?.toFixed(2) || 0),
        orderTax: parseFloat(purchase.orderTax?.toFixed(2) || 0),
        discountAmount: parseFloat(purchase.discountAmount?.toFixed(2) || 0),
        shippingCost: parseFloat(purchase.shippingCost?.toFixed(2) || 0),
        grandTotal: parseFloat(purchase.grandTotal.toFixed(2)),
        amountPaid: parseFloat(purchase.amountPaid.toFixed(2)),
        amountDue: parseFloat(purchase.amountDue.toFixed(2)),
        status: purchase.status || 'pending',
        paymentStatus: purchase.paymentStatus || 'unpaid',
        dueDate: purchase.dueDate ? purchase.dueDate.toLocaleDateString() : 'N/A',
        receivedDate: purchase.receivedDate ? purchase.receivedDate.toLocaleDateString() : 'N/A',
        createdBy: purchase.createdBy?.name || 'N/A',
        notes: purchase.notes || ''
    }));

    if (format === 'pdf') {
        const body = [
            ['Purchase #', 'Date', 'Supplier', 'Warehouse', 'Items', 'Total', 'Paid', 'Due', 'Status']
        ];
        reportData.forEach(purchase => {
            body.push([
                purchase.purchaseNumber,
                purchase.purchaseDate,
                purchase.supplierName,
                purchase.warehouseName,
                purchase.itemsCount,
                `$${purchase.grandTotal}`,
                `$${purchase.amountPaid}`,
                `$${purchase.amountDue}`,
                purchase.status.toUpperCase()
            ]);
        });

        // Add summary row
        body.push(['', '', '', '', '', '', '', '', '']);
        body.push(['SUMMARY', '', `Orders: ${summary.totalPurchases}`, `Amount: $${summary.totalAmount}`, `Items: ${summary.totalItemsOrdered}`, `Avg: $${summary.avgOrderValue}`, `Paid: $${summary.totalPaid}`, `Due: $${summary.totalDue}`, '']);

        const docDefinition = {
            content: [
                { text: 'Purchase Report', style: 'header' },
                { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 5] },
                { text: `Period: ${startDate || 'All'} to ${endDate || 'All'}`, style: 'subheader' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: body
                    },
                    layout: 'lightHorizontalLines'
                }
            ],
            styles: {
                header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 15] }
            }
        };
        generatePdf(docDefinition, 'purchase_report', res);

    } else if (format === 'excel') {
        const columns = [
            { header: 'Purchase Number', key: 'purchaseNumber', width: 20 },
            { header: 'Purchase Date', key: 'purchaseDate', width: 12 },
            { header: 'Supplier', key: 'supplierName', width: 25 },
            { header: 'Supplier Email', key: 'supplierEmail', width: 25 },
            { header: 'Warehouse', key: 'warehouseName', width: 20 },
            { header: 'Items Count', key: 'itemsCount', width: 12 },
            { header: 'Total Quantity', key: 'totalQuantity', width: 15 },
            { header: 'Subtotal', key: 'subtotal', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Order Tax', key: 'orderTax', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Discount', key: 'discountAmount', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Shipping Cost', key: 'shippingCost', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Grand Total', key: 'grandTotal', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Amount Paid', key: 'amountPaid', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Amount Due', key: 'amountDue', width: 12, style: { numFmt: '$#,##0.00' } },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Payment Status', key: 'paymentStatus', width: 15 },
            { header: 'Due Date', key: 'dueDate', width: 12 },
            { header: 'Received Date', key: 'receivedDate', width: 12 },
            { header: 'Created By', key: 'createdBy', width: 20 },
            { header: 'Notes', key: 'notes', width: 30 }
        ];
        await generateExcel(columns, reportData, 'purchase_report', 'Purchase Report', res);

    } else { // Default to JSON
        const pagination = {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            totalRecords: totalCount,
            limit: parseInt(limit)
        };

        res.json({
            purchases,
            summary,
            pagination
        });
    }
});

// @desc    Get Comprehensive Inventory Report
// @route   GET /api/reports/inventory
// @access  Protected (Manager/Admin)
exports.getInventoryReport = asyncHandler(async (req, res) => {
    const { 
        format = 'json', 
        page = 1, 
        limit = 25,
        locationId,
        categoryId,
        search,
        stockStatus,
        lowStock,
        sortBy = 'productName',
        sortOrder = 'asc'
    } = req.query;

    console.log('🚀 Starting inventory report generation...');
    
    try {
        // Base aggregation pipeline
        const pipeline = [
            {
                $lookup: {
                    from: 'products',
                    localField: 'product',
                    foreignField: '_id',
                    as: 'productInfo'
                }
            },
            {
                $lookup: {
                    from: 'locations',
                    localField: 'location',
                    foreignField: '_id',
                    as: 'locationInfo'
                }
            },
            {
                $lookup: {
                    from: 'productcategories',
                    localField: 'productInfo.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $unwind: {
                    path: '$productInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: '$locationInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $unwind: {
                    path: '$categoryInfo',
                    preserveNullAndEmptyArrays: true
                }
            }
        ];

        // Apply authorization filters
        const matchFilters = {};
        if (req.user.role !== 'admin') {
            const accessibleLocations = req.user.locations || [];
            if (accessibleLocations.length === 0) {
                return res.json({ inventory: [], summary: {}, pagination: {} });
            }
            matchFilters.location = { $in: accessibleLocations };
        }

        // Apply query filters
        if (locationId) {
            if (!mongoose.Types.ObjectId.isValid(locationId)) {
                res.status(400);
                throw new Error('Invalid Location ID format');
            }
            matchFilters.location = mongoose.Types.ObjectId(locationId);
        }

        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                res.status(400);
                throw new Error('Invalid Category ID format');
            }
            matchFilters['productInfo.category'] = mongoose.Types.ObjectId(categoryId);
        }

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            matchFilters.$or = [
                { 'productInfo.name': searchRegex },
                { 'productInfo.sku': searchRegex },
                { 'locationInfo.name': searchRegex }
            ];
        }

        if (lowStock === 'true') {
            matchFilters.$expr = { $lte: ['$quantity', '$notifyAt'] };
        }

        if (stockStatus) {
            switch (stockStatus) {
                case 'in_stock':
                    matchFilters.quantity = { $gt: 0 };
                    break;
                case 'out_of_stock':
                    matchFilters.quantity = { $eq: 0 };
                    break;
                case 'low_stock':
                    matchFilters.$expr = { $lte: ['$quantity', '$notifyAt'] };
                    break;
            }
        }

        // Add match stage if we have filters
        if (Object.keys(matchFilters).length > 0) {
            pipeline.push({ $match: matchFilters });
        }

        // Add calculated fields
        pipeline.push({
            $addFields: {
                stockValue: { 
                    $multiply: ['$quantity', { $ifNull: ['$productInfo.sellingPrice', 0] }] 
                },
                stockStatus: {
                    $cond: [
                        { $eq: ['$quantity', 0] },
                        'out_of_stock',
                        {
                            $cond: [
                                { $lte: ['$quantity', '$notifyAt'] },
                                'low_stock',
                                'in_stock'
                            ]
                        }
                    ]
                },
                lowStockAlert: { $lte: ['$quantity', '$notifyAt'] }
            }
        });

        // Create facet for summary statistics and main data
        const facetPipeline = {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            totalProducts: { $sum: 1 },
                            totalQuantity: { $sum: '$quantity' },
                            totalValue: { $sum: '$stockValue' },
                            lowStockItems: {
                                $sum: { $cond: [{ $eq: ['$stockStatus', 'low_stock'] }, 1, 0] }
                            },
                            outOfStockItems: {
                                $sum: { $cond: [{ $eq: ['$stockStatus', 'out_of_stock'] }, 1, 0] }
                            },
                            avgStockValue: { $avg: '$stockValue' },
                            totalLocations: { $addToSet: '$location' },
                            totalCategories: { $addToSet: '$productInfo.category' }
                        }
                    },
                    {
                        $addFields: {
                            totalLocations: { $size: '$totalLocations' },
                            totalCategories: { $size: '$totalCategories' }
                        }
                    }
                ],
                data: [
                    {
                        $project: {
                            _id: 1,
                            productId: '$product',
                            productName: '$productInfo.name',
                            sku: '$productInfo.sku',
                            productImage: '$productInfo.imageUrl',
                            categoryName: '$categoryInfo.name',
                            locationName: '$locationInfo.name',
                            quantity: 1,
                            minStock: 1,
                            notifyAt: 1,
                            sellingPrice: '$productInfo.sellingPrice',
                            stockValue: 1,
                            stockStatus: 1,
                            lowStockAlert: 1,
                            lastUpdated: '$updatedAt',
                            isActive: '$productInfo.isActive'
                        }
                    }
                ]
            }
        };

        pipeline.push(facetPipeline);

        // Execute aggregation
        console.log('📊 Executing inventory aggregation...');
        const result = await Inventory.aggregate(pipeline);
        
        const summaryData = result[0]?.summary[0] || {};
        let inventoryData = result[0]?.data || [];

        // Handle sorting
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        const sortField = sortBy === 'productName' ? 'productName' : 
                         sortBy === 'quantity' ? 'quantity' :
                         sortBy === 'stockValue' ? 'stockValue' :
                         sortBy === 'locationName' ? 'locationName' : 'productName';

        inventoryData.sort((a, b) => {
            const aVal = a[sortField] || '';
            const bVal = b[sortField] || '';
            
            if (typeof aVal === 'string') {
                return sortDirection * aVal.localeCompare(bVal);
            }
            return sortDirection * (aVal - bVal);
        });

        // Handle pagination for JSON response
        const totalCount = inventoryData.length;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const paginatedData = inventoryData.slice(skip, skip + parseInt(limit));

        const summary = {
            totalProducts: summaryData.totalProducts || 0,
            totalQuantity: summaryData.totalQuantity || 0,
            totalValue: summaryData.totalValue || 0,
            lowStockItems: summaryData.lowStockItems || 0,
            outOfStockItems: summaryData.outOfStockItems || 0,
            avgStockValue: summaryData.avgStockValue || 0,
            totalLocations: summaryData.totalLocations || 0,
            totalCategories: summaryData.totalCategories || 0,
            stockHealthPercentage: summaryData.totalProducts ? 
                Math.round(((summaryData.totalProducts - summaryData.lowStockItems - summaryData.outOfStockItems) / summaryData.totalProducts) * 100) : 0
        };

        console.log('✅ Inventory report generated successfully');

        // Handle different output formats
        if (format === 'pdf') {
            const reportData = inventoryData.map(item => ({
                productName: item.productName || 'N/A',
                sku: item.sku || 'N/A',
                categoryName: item.categoryName || 'N/A',
                locationName: item.locationName || 'N/A',
                quantity: item.quantity || 0,
                minStock: item.minStock || 0,
                sellingPrice: item.sellingPrice || 0,
                stockValue: item.stockValue || 0,
                stockStatus: item.stockStatus || 'unknown'
            }));

            const body = [
                ['Product', 'SKU', 'Category', 'Location', 'Qty', 'Min Stock', 'Price', 'Value', 'Status']
            ];

            reportData.forEach(item => {
                body.push([
                    item.productName,
                    item.sku,
                    item.categoryName,
                    item.locationName,
                    item.quantity.toString(),
                    item.minStock.toString(),
                    `$${item.sellingPrice.toFixed(2)}`,
                    `$${item.stockValue.toFixed(2)}`,
                    item.stockStatus.replace('_', ' ').toUpperCase()
                ]);
            });

            // Add summary row
            body.push(['', '', '', '', '', '', '', '', '']);
            body.push(['SUMMARY', `Products: ${summary.totalProducts}`, `Quantity: ${summary.totalQuantity}`, `Value: $${summary.totalValue.toFixed(2)}`, `Low Stock: ${summary.lowStockItems}`, `Out of Stock: ${summary.outOfStockItems}`, `Health: ${summary.stockHealthPercentage}%`, '', '']);

            const docDefinition = {
                content: [
                    { text: 'Inventory Report', style: 'header' },
                    { text: `Generated on: ${new Date().toLocaleDateString()}`, margin: [0, 0, 0, 5] },
                    { text: `Total Products: ${summary.totalProducts} | Total Value: $${summary.totalValue.toFixed(2)}`, style: 'subheader' },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                            body: body
                        },
                        layout: 'lightHorizontalLines'
                    }
                ],
                styles: {
                    header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
                    subheader: { fontSize: 12, italics: true, margin: [0, 0, 0, 15] }
                }
            };
            generatePdf(docDefinition, 'inventory_report', res);

        } else if (format === 'excel') {
            const reportData = inventoryData.map(item => ({
                productName: item.productName || 'N/A',
                sku: item.sku || 'N/A',
                categoryName: item.categoryName || 'N/A',
                locationName: item.locationName || 'N/A',
                quantity: item.quantity || 0,
                minStock: item.minStock || 0,
                notifyAt: item.notifyAt || 0,
                sellingPrice: item.sellingPrice || 0,
                stockValue: item.stockValue || 0,
                stockStatus: item.stockStatus || 'unknown',
                lowStockAlert: item.lowStockAlert ? 'YES' : 'NO',
                lastUpdated: item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : 'N/A',
                isActive: item.isActive ? 'Active' : 'Inactive'
            }));

            const columns = [
                { header: 'Product Name', key: 'productName', width: 30 },
                { header: 'SKU', key: 'sku', width: 15 },
                { header: 'Category', key: 'categoryName', width: 20 },
                { header: 'Location', key: 'locationName', width: 20 },
                { header: 'Current Qty', key: 'quantity', width: 12 },
                { header: 'Min Stock', key: 'minStock', width: 12 },
                { header: 'Notify At', key: 'notifyAt', width: 12 },
                { header: 'Selling Price', key: 'sellingPrice', width: 15, style: { numFmt: '$#,##0.00' } },
                { header: 'Stock Value', key: 'stockValue', width: 15, style: { numFmt: '$#,##0.00' } },
                { header: 'Stock Status', key: 'stockStatus', width: 15 },
                { header: 'Low Stock Alert', key: 'lowStockAlert', width: 15 },
                { header: 'Last Updated', key: 'lastUpdated', width: 15 },
                { header: 'Status', key: 'isActive', width: 12 }
            ];
            await generateExcel(columns, reportData, 'inventory_report', 'Inventory Report', res);

        } else { // Default to JSON
            const pagination = {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / parseInt(limit)),
                totalRecords: totalCount,
                limit: parseInt(limit)
            };

            res.json({
                inventory: paginatedData,
                summary,
                pagination
            });
        }

    } catch (error) {
        console.error('❌ Error generating inventory report:', error);
        res.status(500);
        throw new Error(`Failed to generate inventory report: ${error.message}`);
    }
});