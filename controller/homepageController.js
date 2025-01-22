const Order = require('../model/orderSchema');
const Product = require('../model/productModel');
const Category = require('../model/categoryModel');
const Offer = require('../model/offerModel')


const getBestSellingProducts = async (req, res) => {
    try {
      const bestSellers = await Order.aggregate([
        { $match: { 
          'paymentInfo.status': { $in: ['CONFIRMED', 'DELIVERED','ON THE ROAD'] },
          'isDeleted': false 
        }},
        // Unwind the products array to handle each product separately
        { $unwind: '$products' },
        { $group: {
          _id: '$products.product',
          totalQuantitySold: { $sum: '$products.quantity' }
        }},

        { $sort: { totalQuantitySold: -1 } },

        { $limit: 6 },
        // Lookup product details
        { $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDetails'
        }},
        { $unwind: '$productDetails' },
        { $match: { 'productDetails.isDeleted': false } },

        { $project: {
          _id: 1,
          name: '$productDetails.name',
          images: { $first: '$productDetails.images' },
          variants: '$productDetails.variants',
          totalQuantitySold: 1
        }}
      ]);
  

      const formattedBestSellers = bestSellers.map(product => ({
        _id: product._id,
        title: product.name,
        img: product.images,
        price: Math.min(...product.variants.map(v => v.price)),
        reviews: product.totalQuantitySold 
      }));
  
      res.status(200).json({
        status: 'success',
        data: formattedBestSellers
      });
  
    } catch (error) {
      console.error('Error fetching best selling products:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch best selling products'
      });
    }
  };

const categoriesForHome = async (req,res)=>{
  try {
    const categories = await Category.find({ isActive: true })
        .select('name description isActive') 
        .lean(); 

    if (!categories || categories.length === 0) {
        return res.status(404).json({ message: 'No active categories found' });
    }

    res.status(200).json(categories);
} catch (error) {
    console.error('Error in categoriesForHome:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
}
}


const categoryImage = async(req,res)=>{
  try {
    const categoryId = req.params.id; 

    if (!categoryId) {
        return res.status(400).json({ message: 'Category ID is required' });
    }

    const products = await Product.find({
      category: categoryId,
      isDeleted: false,
      images: { $exists: true, $ne: [] } 
    })
    .select('images')
    .limit(1)
    .lean();

    const productCount = await Product.countDocuments({
        category: categoryId,
        isDeleted: false
    });

    res.status(200).json({
      products: products.length > 0 ? products : [], 
      count: productCount
    });
} catch (error) {
    console.error('Error in categoryImage:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
}
}


const getReviewsForHome = async (req, res) => {
  try {

    const orders = await Order.find({
      'rating.stars': { $exists: true, $gt: 0 },  
      'rating.feedback': { $exists: true, $ne: '' } 
    })
    .populate({
      path: 'user',
      select: 'firstname lastname profileImage',
      match: { isDeleted: { $ne: true } }  
    })
    .select('rating user createdAt')
    .sort({ 'rating.createdAt': -1 })
    .limit(10);  

    
    const validOrders = orders.filter(order => order.user);

    const reviews = validOrders.map(order => ({
      id: order._id,
      name: order.user ? `${order.user.firstname} ${order.user.lastname}` : 'Anonymous',
      feedback: order.rating.feedback,
      rating: order.rating.stars,
      profileImage: order.user?.profileImage || null,
      createdAt: order.rating.createdAt || order.createdAt
    }));

    res.json({
      status: 'success',
      data: reviews
    });
  } catch (error) {
    console.error('Error in getReviewsForHome:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching reviews',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const activeOffers = async(req,res)=>{
  try {
    const currentDate = new Date();
    
    const activeOffer = await Offer.findOne({
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).populate({
      path: 'targetId',
      select: 'title name' 
    });

    if (!activeOffer) {
      return res.status(200).json({
        status: 'success',
        data: null,
        message: 'No active offers found'
      });
    }

    const formattedOffer = {
      id: activeOffer._id,
      title: activeOffer.name,
      description: activeOffer.description,
      discountType: activeOffer.discountType,
      discountValue: activeOffer.discountValue,
      applicableTo: activeOffer.applicableTo,
      target: activeOffer.targetId,
      maxDiscountAmount: activeOffer.maxDiscountAmount,
      endDate: activeOffer.endDate
    };

    res.status(200).json({
      status: 'success',
      data: formattedOffer
    });

  } catch (error) {
    console.error('Error fetching active offers:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch active offers'
    });
  }
}

const searchProducts = async(req,res)=>{
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchPattern = new RegExp(query, 'i');

    const categoryResults = await Category.find({
      name: searchPattern,
      isActive: true
    });

    const productResults = await Product.find({
      $or: [
        { name: searchPattern },
        { brand: searchPattern },
        { category: { $in: categoryResults.map(cat => cat._id) } }
      ],
      isDeleted: false,
      'variants.stock': { $gt: 0 }
    })
    .populate({
      path: 'category',
      match: { isActive: true }, 
      select: 'name description currentOffer'
    })
    .populate('currentOffer')
    .select('-isDeleted'); 

    const filteredProducts = productResults.filter(product => product.category !== null);

    const productsWithAvailability = filteredProducts.map(product => {
      const availableVariants = product.variants.filter(variant => variant.stock > 0);
      return {
        ...product.toObject(),
        hasStock: availableVariants.length > 0,
        availableVariants: availableVariants
      };
    });

    res.json(productsWithAvailability);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error performing search' });
  }
}


  module.exports = {
    getBestSellingProducts,
    categoriesForHome,
    categoryImage,
    getReviewsForHome,
    activeOffers,
    searchProducts
  }