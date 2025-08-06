const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Import generic database service
const {
  findAll,
  findOne,
  findById,
  insertOne,
  updateOne,
  updateById,
  deleteOne,
  deleteById,
  countDocuments,
  exists,
  distinct,
  updateMany
} = require('../services/mongoose_service');

// Analytics routes (No authentication required)
// Get comprehensive analytics
router.get('/analytics', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const numDays = parseInt(days);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    
    // Summary statistics
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    const avgOrderValue = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
    ]);
    
    const newCustomers = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$customer.email' } },
      { $count: 'count' }
    ]);
    
    // Daily revenue and orders data
    const dailyData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Format daily data for charts
    const revenueData = dailyData.map(item => ({
      date: item._id,
      revenue: item.revenue
    }));
    
    const ordersData = dailyData.map(item => ({
      date: item._id,
      orders: item.orders
    }));
    
    // Top selling products
    const topProducts = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate }, status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.product', totalSales: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { name: '$product.name', sales: '$totalSales' } },
      { $sort: { sales: -1 } },
      { $limit: 5 }
    ]);
    
    // Category distribution
    const categoryData = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate }, status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.category', value: { $sum: '$items.quantity' } } },
      { $project: { name: '$_id', value: '$value' } },
      { $sort: { value: -1 } }
    ]);
    
    const responseData = {
      success: true,
      summary: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        averageOrderValue: avgOrderValue[0]?.avg || 0,
        newCustomers: newCustomers[0]?.count || 0
      },
      revenueData,
      ordersData,
      topProducts,
      categoryData
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch analytics',
      error: error.message 
    });
  }
});

// Get sales analytics by period (daily, monthly, yearly)
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = 'daily', range = '30' } = req.query;
    const days = parseInt(range);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    let groupBy;
    let dateFormat;
    
    switch (period) {
      case 'yearly':
        groupBy = { $year: '$createdAt' };
        dateFormat = '%Y';
        break;
      case 'monthly':
        groupBy = { 
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        dateFormat = '%Y-%m';
        break;
      case 'daily':
      default:
        groupBy = {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        };
        dateFormat = '%Y-%m-%d';
        break;
    }
    
    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: 'Cancelled' }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      data: salesData,
      period,
      range: days
    });
  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch sales analytics',
      error: error.message 
    });
  }
});

// Get order status analytics
router.get('/analytics/orders', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const numDays = parseInt(days);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    
    const statusData = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: '$count' } },
      { $sort: { count: -1 } }
    ]);
    
    const dailyOrders = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        statusData,
        dailyOrders
      }
    });
  } catch (error) {
    console.error('Error fetching order analytics:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch order analytics',
      error: error.message 
    });
  }
});

// Apply authentication middleware to all other admin routes
router.use(verifyToken);

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const totalProducts = await countDocuments(Product);
    const totalOrders = await countDocuments(Order);
    const pendingOrders = await countDocuments(Order, { status: 'Pending' });
    
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    const recentOrders = await findAll(Order, {}, {
      sort: { createdAt: -1 },
      limit: 5,
      lean: true
    });
    
    const lowStockProducts = await Product.find({ inStock: false }).limit(5).lean();
    
    res.json({
      stats: {
        totalProducts,
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
      recentOrders,
      lowStockProducts,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all products for admin
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, featured } = req.query;
    
    const filter = {};
    if (category) filter.category = category;
    if (featured !== undefined) filter.featured = featured === 'true';
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));
    
    res.json({
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching admin products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get all orders for admin
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.product')
      .lean();
    
    const total = await Order.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));
    
    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update order status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'Dispatched', 'Delivered', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedAt: new Date(),
        ...(status === 'Dispatched' && { dispatchedAt: new Date() }),
        ...(status === 'Delivered' && { deliveredAt: new Date() }),
        ...(status === 'Cancelled' && { cancelledAt: new Date() })
      },
      { new: true, runValidators: true }
    ).populate('items.product');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      success: true,
      message: `Order ${status.toLowerCase()} successfully`,
      data: order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router; 