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
            isDeleted: isDeleted === 'true',
            'paymentInfo.status': { 
                $in: ['CONFIRMED', 'DELIVERED', 'ON THE ROAD','PENDING'],
                $ne: 'CANCELED'
            }
        };

        let orders = await Order.find(query)
            .populate('user', '_id firstname lastname')
            .populate({
                path: 'products.product',
                select: 'name variants category currentOffer',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'currentOffer', select: 'discountType discountValue maxDiscountAmount' }
                ]
            })
            .populate('couponApplied', 'discountAmount discountPercentage maxDiscount')
            .lean();

        orders = orders
            .filter(order => order.products.some(p => !p.returnStatus?.isReturned))
            .filter(order => order.products.every(p => p.product))
            .map(order => {
                const allProducts = order.products;

                // 1️⃣ Compute subtotal after product offers (including returned products for coupon base)
                const subtotalAfterOffersAll = allProducts.reduce((acc, p) => {
                    const product = p.product;
                    if (!product) return acc;
                    const variant = product.variants.find(v => v.size === p.variantSize || v._id === p.variantId);
                    if (!variant) return acc;

                    let price = variant.price;

                    // Apply product offer if exists
                    if (product.currentOffer) {
                        const offer = product.currentOffer;
                        if (offer.discountType === 'PERCENTAGE') {
                            const discountAmt = (price * offer.discountValue) / 100;
                            price -= Math.min(discountAmt, offer.maxDiscountAmount || discountAmt);
                        } else {
                            price -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
                        }
                    }

                    return acc + price * p.quantity;
                }, 0);

                // 2️⃣ Compute shipping fee
                const shippingFee = Number(order.shippingFee || 0);

                // 3️⃣ Compute product discounts only for valid (non-returned) products
                const validProducts = allProducts.filter(p => !p.returnStatus?.isReturned);

                const productDiscounts = validProducts.reduce((acc, p) => {
                    const product = p.product;
                    if (!product) return acc;
                    const variant = product.variants.find(v => v.size === p.variantSize || v._id === p.variantId);
                    if (!variant) return acc;

                    let price = variant.price;

                    if (product.currentOffer) {
                        const offer = product.currentOffer;
                        if (offer.discountType === 'PERCENTAGE') {
                            const discountAmt = (price * offer.discountValue) / 100;
                            price -= Math.min(discountAmt, offer.maxDiscountAmount || discountAmt);
                        } else {
                            price -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
                        }
                    }

                    return acc + (variant.price * p.quantity - price * p.quantity); // total offer discount
                }, 0);

                // 4️⃣ Compute coupon discount proportionally (based on subtotal after offers for all products)
                let couponDiscount = 0;
                if (order.couponApplied && order.discountAmount > 0 && subtotalAfterOffersAll > 0) {
                    couponDiscount = validProducts.reduce((acc, p) => {
                        const product = p.product;
                        if (!product) return acc;
                        const variant = product.variants.find(v => v.size === p.variantSize || v._id === p.variantId);
                        if (!variant) return acc;

                        let price = variant.price;
                        if (product.currentOffer) {
                            const offer = product.currentOffer;
                            if (offer.discountType === 'PERCENTAGE') {
                                const discountAmt = (price * offer.discountValue) / 100;
                                price -= Math.min(discountAmt, offer.maxDiscountAmount || discountAmt);
                            } else {
                                price -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
                            }
                        }

                        // proportional coupon share (using all products subtotal for base)
                        const productShare = (price * p.quantity) / subtotalAfterOffersAll;
                        return acc + productShare * order.discountAmount;
                    }, 0);
                }

                const totalDiscount = productDiscounts + couponDiscount;

                // 5️⃣ Compute final total for valid products
                const computedFinalPrice = validProducts.reduce((sum, p) => {
                    const product = p.product;
                    if (!product) return sum;
                    const variant = product.variants.find(v => v.size === p.variantSize || v._id === p.variantId);
                    if (!variant) return sum;

                    let price = variant.price;
                    if (product.currentOffer) {
                        const offer = product.currentOffer;
                        if (offer.discountType === 'PERCENTAGE') {
                            const discountAmt = (price * offer.discountValue) / 100;
                            price -= Math.min(discountAmt, offer.maxDiscountAmount || discountAmt);
                        } else {
                            price -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
                        }
                    }

                    // proportional coupon
                    if (order.couponApplied && order.discountAmount > 0 && subtotalAfterOffersAll > 0) {
                        const productShare = (price * p.quantity) / subtotalAfterOffersAll;
                        const proportionalDiscount = productShare * order.discountAmount;
                        price -= proportionalDiscount / p.quantity;
                    }

                    return sum + price * p.quantity;
                }, 0) + shippingFee;

                return {
                    ...order,
                    products: allProducts.map(p => ({
                        ...p,
                        variant: p.product.variants.find(v => v.size === p.variantSize || v._id === p.variantId)
                    })),
                    originalTotal: Number(validProducts.reduce((sum, p) => {
                        const variant = p.product.variants.find(v => v.size === p.variantSize || v._id === p.variantId);
                        return sum + (variant ? variant.price * p.quantity : 0);
                    }, 0).toFixed(2)),
                    productDiscounts: Number(productDiscounts.toFixed(2)),
                    couponDiscount: Number(couponDiscount.toFixed(2)),
                    discountAmount: Number(totalDiscount.toFixed(2)),
                    computedTotal: Number(computedFinalPrice.toFixed(2))
                };
            });

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