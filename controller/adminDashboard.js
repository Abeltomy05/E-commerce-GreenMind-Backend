const Order = require('../model/orderSchema')
const Product = require('../model/productModel')
const Category = require('../model/categoryModel')

const getOrders = async (req, res) => {
    try {
      const { startDate, endDate, isDeleted } = req.query;
  
      const query = {
        createdAt: { 
          $gte: new Date(startDate), 
          $lte: new Date(endDate) 
        },
        isDeleted: isDeleted === 'true' ? true : false,
        'paymentInfo.status': { 
          $in: ['CONFIRMED', 'DELIVERED', 'ON THE ROAD','PENDING'],
          $ne: 'CANCELED'
        }
      };

     let orders = await Order.find(query)
        .populate('user', '_id firstname lastname')
        .populate({
          path: 'products.product',
          select: 'name variants category',
          populate: {
            path: 'category',
            select: 'name'
          }
        })
        .lean();
  
        orders = orders
        .filter(order => !order.products.some(p => p.returnStatus?.isReturned))
        .filter(order => order.products.every(p => p.product));

        res.json(orders);

    } catch (error) {
      console.error('Error in getOrders:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  };
  

const getCategorySalesData = async (req, res) => {
    try {
      const activeCategories = await Category.find({ isActive: true });
      
      const orders = await Order.find({
        'paymentInfo.status': { 
          $in: ['CONFIRMED', 'DELIVERED', 'ON THE ROAD', 'PENDING'],
          $ne: 'CANCELED'
        },
        isDeleted: false
      }).populate({
        path: 'products.product',
        select: 'category name',
        populate: {
          path: 'category',
          select: 'name isActive'
        }
      });
  
      const categoryData = activeCategories.reduce((acc, cat) => {
        acc[cat._id.toString()] = {
          name: cat.name,
          totalSold: 0
        };
        return acc;
      }, {});
  
      let totalProductsSold = 0;
      orders.forEach(order => {
        order.products.forEach(item => {
          if (item.product?.category && !item.returnStatus?.isReturned) {
            const categoryId = item.product.category._id.toString();
            if (categoryData[categoryId]) {
              categoryData[categoryId].totalSold += item.quantity;
              totalProductsSold += item.quantity;
            }
          }
        });
      });
  
      // Calculate percentages and format response
      const result = Object.values(categoryData)
        .map(category => ({
          category: category.name,
          count: category.totalSold,
          percentage: totalProductsSold > 0 
            ? ((category.totalSold / totalProductsSold) * 100).toFixed(1)
            : "0.0"
        }))
        .sort((a, b) => b.count - a.count);
  
      res.json({
        totalProducts: totalProductsSold,
        categories: result
      });
  
    } catch (error) {
      console.error('Error in getCategorySalesData:', error);
      res.status(500).json({ message: 'Failed to fetch category sales data' });
    }
  };
  
  const getTopItems = async (req, res) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const topProducts = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            'paymentInfo.status': { $ne: 'CANCELED' },
            isDeleted: false 
          }
        },
        { $unwind: '$products' },
        {
          $lookup: {
            from: 'products',
            localField: 'products.product',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $match: {
            'productInfo.isDeleted': false
          }
        },
        {
          $group: {
            _id: '$products.product',
            count: { $sum: '$products.quantity' },
            name: { $first: '$productInfo.name' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 1,
            name: 1,
            count: 1
          }
        }
      ]);
  
      // Get top categories with only name and count
      const topCategories = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            'paymentInfo.status': { $ne: 'CANCELED' },
            isDeleted: false
          }
        },
        { $unwind: '$products' },
        {
          $lookup: {
            from: 'products',
            localField: 'products.product',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $match: {
            'productInfo.isDeleted': false
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'productInfo.category',
            foreignField: '_id',
            as: 'categoryInfo'
          }
        },
        { $unwind: '$categoryInfo' },
        {
          $match: {
            'categoryInfo.isActive': true
          }
        },
        {
          $group: {
            _id: '$productInfo.category',
            count: { $sum: '$products.quantity' },
            name: { $first: '$categoryInfo.name' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $project: {
            name: 1,
            count: 1
          }
        }
      ]);
  
      // Get top brands with only name and count
      const topBrands = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            'paymentInfo.status': { $ne: 'CANCELED' },
            isDeleted: false
          }
        },
        { $unwind: '$products' },
        {
          $lookup: {
            from: 'products',
            localField: 'products.product',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $match: {
            'productInfo.isDeleted': false,
            'productInfo.brand': { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$productInfo.brand',
            count: { $sum: '$products.quantity' },
            name: { $first: '$productInfo.brand' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $project: {
            name: 1,
            count: 1
          }
        }
      ]);
  
      if (!topProducts.length && !topCategories.length && !topBrands.length) {
        return res.json({
          topProducts: [],
          topCategories: [],
          topBrands: []
        });
      }
  
      res.json({
        topProducts,
        topCategories,
        topBrands
      });
  
    } catch (error) {
      console.error('Error fetching top items:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };


module.exports = {
    getOrders,
    getCategorySalesData,
    getTopItems 
}