const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { verifyToken } = require('../middleware/auth');

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

// Debug endpoint to test database connection and orders
router.get('/debug', async (req, res) => {
  try {
    const orderCount = await countDocuments(Order);
    const pendingOrders = await countDocuments(Order, { status: 'Pending' });
    const dispatchedOrders = await countDocuments(Order, { status: 'Dispatched' });
    const deliveredOrders = await countDocuments(Order, { status: 'Delivered' });
    
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

// Test order creation endpoint (for debugging)
router.post('/test', verifyToken, async (req, res) => {
  try {
    console.log('🧪 Test order creation - User authenticated:', req.admin?.id);
    console.log('🧪 Test order data:', JSON.stringify(req.body, null, 2));
    
    // Create a minimal test order
    const testOrderData = {
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        phone: '1234567890'
      },
      shippingAddress: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        zipCode: '12345',
        country: 'United States'
      },
      items: [{
        product: '507f1f77bcf86cd799439011', // Test product ID
        productName: 'Test Product',
        price: 10.00,
        quantity: 1
      }],
      subtotal: 10.00,
      shippingCost: 0,
      tax: 0,
      totalAmount: 10.00,
      paymentMethod: 'cod'
    };
    
    const order = new Order(testOrderData);
    const savedOrder = await order.save();
    
    res.json({
      success: true,
      message: 'Test order created successfully',
      data: {
        orderId: savedOrder._id,
        orderNumber: savedOrder.orderNumber,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('🧪 Test order creation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Test order creation failed',
      error: error.message
    });
  }
});

// Auth test endpoint
router.get('/auth-test', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication successful',
    user: {
      id: req.user?.id || req.admin?.id,
      email: req.user?.email || req.admin?.email,
      username: req.user?.username || req.admin?.username
    },
    timestamp: new Date().toISOString()
  });
});

// Get all orders (admin only)
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await findAll(Order, filter, {
      sort: { createdAt: -1 },
      skip: skip,
      limit: parseInt(limit),
      lean: true
    });
    
    const total = await countDocuments(Order, filter);
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
    const order = await findById(Order, req.params.id);
    
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

// Create new order (requires authentication)
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('🛒 Order creation - User authenticated:', req.admin?.id);
    console.log('🛒 Request headers:', req.headers);
    console.log('🛒 Request body type:', typeof req.body);
    console.log('🛒 Request body keys:', req.body ? Object.keys(req.body) : 'No body');
    console.log('🛒 Received order data:', JSON.stringify(req.body, null, 2));
    
    // Detailed validation with specific error messages
    const { customer, shippingAddress, items, totalAmount } = req.body;
    const validationErrors = [];
    
    // Validate customer information
    if (!customer) {
      validationErrors.push('Customer information is missing');
    } else {
      if (!customer.name || !customer.name.trim()) {
        validationErrors.push('Customer name is required');
      }
      if (!customer.email || !customer.email.trim()) {
        validationErrors.push('Customer email is required');
      }
      if (!customer.phone || !customer.phone.trim()) {
        validationErrors.push('Customer phone is required');
      }
    }
    
    // Validate shipping address
    if (!shippingAddress) {
      validationErrors.push('Shipping address information is missing');
    } else {
      if (!shippingAddress.street || !shippingAddress.street.trim()) {
        validationErrors.push('Shipping street address is required');
      }
      if (!shippingAddress.city || !shippingAddress.city.trim()) {
        validationErrors.push('Shipping city is required');
      }
      if (!shippingAddress.state || !shippingAddress.state.trim()) {
        validationErrors.push('Shipping state is required');
      }
      if (!shippingAddress.zipCode || !shippingAddress.zipCode.trim()) {
        validationErrors.push('Shipping ZIP code is required');
      }
    }
    
    // Validate items array
    if (!items) {
      validationErrors.push('Order items are missing');
    } else if (!Array.isArray(items)) {
      validationErrors.push('Order items must be an array');
    } else if (items.length === 0) {
      validationErrors.push('At least one order item is required');
    } else {
      items.forEach((item, index) => {
        if (!item.product) {
          validationErrors.push(`Item ${index + 1}: Product ID is required`);
        }
        if (!item.productName || !item.productName.trim()) {
          validationErrors.push(`Item ${index + 1}: Product name is required`);
        }
        if (!item.price || item.price <= 0) {
          validationErrors.push(`Item ${index + 1}: Valid price is required (got: ${item.price})`);
        }
        if (!item.quantity || item.quantity <= 0) {
          validationErrors.push(`Item ${index + 1}: Valid quantity is required (got: ${item.quantity})`);
        }
      });
    }
    
    // Validate total amount
    if (!totalAmount) {
      validationErrors.push('Total amount is missing');
    } else if (totalAmount <= 0) {
      validationErrors.push(`Total amount must be greater than 0 (got: ${totalAmount})`);
    }
    
    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      console.log('🛒 Order validation failed:', validationErrors);
      return res.status(400).json({
        success: false,
        message: 'Order validation failed',
        errors: validationErrors,
        receivedData: {
          hasCustomer: !!customer,
          hasShippingAddress: !!shippingAddress,
          hasItems: !!items,
          itemsCount: items?.length || 0,
          totalAmount: totalAmount
        }
      });
    }
    
    // Create the order with proper error handling
    console.log('🛒 Creating order with data:', req.body);
    
    try {
      const order = new Order(req.body);
      const savedOrder = await order.save();
      console.log('🛒 Order saved successfully:', savedOrder._id);
      
      // Populate the order with product details - using direct findById for now
      const populatedOrder = await findById(Order, savedOrder._id);
      
      console.log('🛒 Order populated successfully:', populatedOrder._id);
      
      res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: populatedOrder
      });
    } catch (saveError) {
      console.error('🛒 Error saving order to database:', saveError);
      
      // Handle specific database errors
      if (saveError.name === 'ValidationError') {
        const validationErrors = Object.values(saveError.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Order validation failed',
          errors: validationErrors
        });
      }
      
      if (saveError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Order number already exists',
          error: 'Duplicate order number'
        });
      }
      
      throw saveError; // Re-throw to be caught by outer catch block
    }
    
  } catch (error) {
    console.error('🛒 Error creating order:', error);
    
    // Handle specific error types
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
        error: 'One or more fields have invalid format'
      });
    }
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Order validation failed',
        errors: validationErrors
      });
    }
    
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
    
    const order = await findById(Order, req.params.id);
    
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
    
    const updatedOrder = await updateById(Order,
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
    
    const order = await findById(Order, req.params.id);
    
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
    
    const updatedOrder = await updateById(Order,
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
    const order = await deleteById(Order, req.params.id);
    
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
    const totalOrders = await countDocuments(Order);
    const pendingOrders = await countDocuments(Order, { status: 'Pending' });
    const dispatchedOrders = await countDocuments(Order, { status: 'Dispatched' });
    const deliveredOrders = await countDocuments(Order, { status: 'Delivered' });
    const cancelledOrders = await countDocuments(Order, { status: 'Cancelled' });
    
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