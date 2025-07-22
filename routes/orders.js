const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// Debug endpoint to test database connection and orders
router.get('/debug', async (req, res) => {
  try {
    const orderCount = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const dispatchedOrders = await Order.countDocuments({ status: 'Dispatched' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });
    
    res.json({
      success: true,
      message: 'Order debug info',
      data: {
        totalOrders: orderCount,
        pendingOrders,
        dispatchedOrders,
        deliveredOrders,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// Get all orders (admin only)
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
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
      success: true,
      message: 'Orders fetched successfully',
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        }
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch orders',
      error: error.message 
    });
  }
});

// Get single order
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .lean();
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Order fetched successfully',
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order',
      error: error.message 
    });
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    console.log('Received order data:', JSON.stringify(req.body, null, 2));
    
    // Validate required fields
    const { customer, shippingAddress, items, totalAmount } = req.body;
    
    if (!customer || !customer.name || !customer.email || !customer.phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer information is required (name, email, phone)'
      });
    }
    
    if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || 
        !shippingAddress.state || !shippingAddress.zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Complete shipping address is required'
      });
    }
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order items are required'
      });
    }
    
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total amount must be greater than 0'
      });
    }
    
    // Create the order
    const order = new Order(req.body);
    await order.save();
    
    // Populate the order with product details
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product')
      .lean();
    
    console.log('Order created successfully:', populatedOrder._id);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: populatedOrder
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create order',
      error: error.message 
    });
  }
});

// Update order status (admin only)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'Dispatched', 'Delivered', 'Cancelled'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be one of: Pending, Dispatched, Delivered, Cancelled' 
      });
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
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    res.json({
      success: true,
      message: `Order ${status.toLowerCase()} successfully`,
      data: order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update order status',
      error: error.message 
    });
  }
});

// Dispatch order (admin only)
router.patch('/:id/dispatch', async (req, res) => {
  try {
    const { trackingNumber, carrier, estimatedDelivery } = req.body;
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.status !== 'Pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only pending orders can be dispatched' 
      });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'Dispatched',
        dispatchedAt: new Date(),
        tracking: {
          trackingNumber,
          carrier,
          estimatedDelivery
        },
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('items.product');
    
    res.json({
      success: true,
      message: 'Order dispatched successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Error dispatching order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to dispatch order',
      error: error.message 
    });
  }
});

// Cancel order (admin only)
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.status === 'Delivered') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot cancel delivered orders' 
      });
    }
    
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'Cancelled',
        cancelledAt: new Date(),
        cancellationReason: reason || 'No reason provided',
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('items.product');
    
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: updatedOrder
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to cancel order',
      error: error.message 
    });
  }
});

// Delete order (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Order deleted successfully',
      data: order
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete order',
      error: error.message 
    });
  }
});

// Get order statistics (admin only)
router.get('/stats/summary', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const dispatchedOrders = await Order.countDocuments({ status: 'Dispatched' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ status: 'Cancelled' });
    
    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    res.json({
      success: true,
      message: 'Order statistics fetched successfully',
      data: {
        totalOrders,
        pendingOrders,
        dispatchedOrders,
        deliveredOrders,
        cancelledOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      }
    });
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch order statistics',
      error: error.message 
    });
  }
});

module.exports = router;