const Order = require('../model/orderSchema')
const Product = require('../model/productModel')

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
          select: 'name variants'
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
  

module.exports = {
    getOrders
}