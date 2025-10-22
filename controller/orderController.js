const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Address = require('../model/addressModel')
const Order = require('../model/orderSchema')
const Coupon = require('../model/coupenModel')
const Wallet = require('../model/walletModel');
const offerModel = require('../model/offerModel');

const verifyStock = async(req,res)=>{
    try {
        const { products } = req.body;
        
        for (const item of products) {
          const product = await Product.findById(item.product);
          
          if (!product) {
            return res.status(404).json({
              success: false,
              message: 'Product not found'
            });
          }
    
          const variant = product.variants.find(v => v.size === item.size);
          
          if (!variant) {
            return res.status(404).json({
              success: false,
              message: `Size ${item.size} not found for product ${product.name}`
            });
          }
    
          if (variant.stock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Only ${variant.stock} units available for ${product.name} in size ${item.size}`
            });
          }
        }
    
        return res.status(200).json({
          success: true,
          message: 'All products are in stock'
        });
    
      } catch (error) {
        console.error('Stock verification error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error verifying stock'
        });
      }
}

const calculateOrderPricing = async (products, couponCode) => {
    let subtotal = 0;
    const productDetails = [];
    
    const shippingFee = 50;

    for (const item of products) {
        const product = await Product.findById(item.product).populate('currentOffer');
        
        if (!product) {
            throw new Error(`Product not found`);
        }

        if (product.isDeleted) {
            throw new Error(`${product.name} is no longer available`);
        }

        const variant = product.variants.find(v => v.size === item.size);
        
        if (!variant) {
            throw new Error(`Selected size ${item.size} not available for ${product.name}`);
        }

        let finalPrice = variant.price;
        let offerDiscount = 0;

        if (product.currentOffer) {
            const currentDate = new Date();
            
            if (currentDate >= product.currentOffer.startDate && currentDate <= product.currentOffer.endDate) {
                if (product.currentOffer.discountType === 'PERCENTAGE') {
                    offerDiscount = (variant.price * product.currentOffer.discountValue) / 100;
                    if (product.currentOffer.maxDiscountAmount) {
                        offerDiscount = Math.min(offerDiscount, product.currentOffer.maxDiscountAmount);
                    }
                } else if (product.currentOffer.discountType === 'FIXED') {
                    offerDiscount = product.currentOffer.discountValue;
                }
                
                finalPrice = Math.max(variant.price - offerDiscount, 0);
            }
        }

        const itemTotal = finalPrice * item.quantity;
        subtotal += itemTotal;

        productDetails.push({
            productId: product._id,
            name: product.name,
            size: item.size,
            quantity: item.quantity,
            originalPrice: variant.price,
            offerDiscount,
            finalPrice,
            total: itemTotal,
            variantId: variant._id,
            offer: product.currentOffer ? {
                name: product.currentOffer.name,
                discountType: product.currentOffer.discountType,
                discountValue: product.currentOffer.discountValue
            } : null
        });
    }

    let discountAmount = 0;
    let couponDetails = null;

    if (couponCode) {
        const currentDate = new Date();
        const coupon = await Coupon.findOne({ 
            code: couponCode,
            startDate: { $lte: currentDate },
            expiryDate: { $gt: currentDate }
        });

        if (!coupon) {
            throw new Error('Invalid or expired coupon code');
        }

        if (coupon.maxUses && coupon.usageCount >= coupon.maxUses) {
            throw new Error('Coupon usage limit exceeded');
        }

        if (subtotal < coupon.minimumPurchaseAmount) {
            throw new Error(`Minimum purchase amount of $${coupon.minimumPurchaseAmount} required for coupon`);
        }

        discountAmount = Math.min((subtotal * coupon.discount) / 100, coupon.maximumDiscountAmount);
        couponDetails = {
            code: coupon.code,
            discountAmount,
            discount: coupon.discount,
            couponId: coupon._id
        };
    }

    const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;

    return {
        subtotal,
        shippingFee,
        discountAmount,
        totalAmount,
        couponDetails,
        productDetails
    };
};

const orderAmount = async(req, res) => {
    try {
        const { products, couponCode } = req.body;
        const result = await calculateOrderPricing(products, couponCode);
       
        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Calculate order amount error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error calculating order amount',
            error: error.message
        });
    }
};

const placeOrder = async (req, res) => {
    try {
        const { 
            userId, 
            products, 
            addressId, 
            paymentMethod, 
            couponCode,
        } = req.body;

        if (!userId || !products || !addressId || !paymentMethod) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required order details' 
            });
        }


        const [user, address] = await Promise.all([
            User.findById(userId),
            Address.findById(addressId)
        ]);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!address) {
            return res.status(404).json({ success: false, message: 'Address not found' });
        }

        const orderCalculation = await calculateOrderPricing(products, couponCode);
        const finalTotalPrice = orderCalculation.totalAmount;

        const orderData = {
            user: userId,
            products: orderCalculation.productDetails.map(item => ({
                product: item.productId,
                variantSize: item.size,
                variantId: item.variantId,
                quantity: item.quantity,
                price: item.finalPrice
            })),
            address: addressId,
            totalPrice: finalTotalPrice,
            paymentInfo: {
                method: paymentMethod,
                status: 'PENDING'
            },
            shippingFee: orderCalculation.shippingFee,
            couponApplied: orderCalculation.couponDetails?.couponId || null,
            discountAmount: orderCalculation.discountAmount,
            expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };

        const order = new Order(orderData);
        await order.validate();
        await order.save();

        await Promise.all(orderCalculation.productDetails.map(item => 
            Product.updateOne(
                { _id: item.productId, 'variants.size': item.size },
                { $inc: { 'variants.$.stock': -item.quantity } }
            )
        ));

        const cartItemIds = products
            .map(item => item.cartItemId)
            .filter(id => id);

        if (cartItemIds.length > 0) {
            await Cart.deleteMany({
                _id: { $in: cartItemIds },
                user: userId
            });
        }

        res.status(201).json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: order._id,
            totalAmount: finalTotalPrice
        });

    } catch (error) {
        console.error('Order placement error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to place order'
        });
    }
};

const razorpayorder = async(req,res)=>{
    try {
        const instance = new Razorpay({
            key_id: process.env.RZP_KEY_ID,
            key_secret: process.env.RZP_KEY_SECRET
        });
        
        const { products, couponCode } = req.body;
        let totalAmount = 0;

        // Calculate initial total
        for (const item of products) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ 
                    success: false,
                    message: `Product ${item.productId} not found` 
                });
            }
            const variant = product.variants.find(v => v.size === item.size);
            if (!variant) {
                return res.status(404).json({ 
                    success: false,
                    message: `Size ${item.size} not found for product ${product.name}` 
                });
            }
            totalAmount += variant.price * item.quantity;
        }

        // Apply coupon discount if available
        let discountAmount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ 
                code: couponCode, 
                startDate: { $lte: new Date() },
                expiryDate: { $gte: new Date() }
            });

            if (coupon && totalAmount >= coupon.minimumPurchaseAmount) {
                discountAmount = Math.min(
                    (totalAmount * coupon.discount) / 100,
                    coupon.maximumDiscountAmount
                );
                totalAmount -= discountAmount;
            }
        }

        const amountInPaise = Math.round(totalAmount * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `order_${Date.now()}`,
        };

        const order = await instance.orders.create(options);
        res.status(200).json({
            success: true,
            order,
            amount: amountInPaise,
            discountAmount
        });

    } catch(error) {
        console.error("Razorpay order creation error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const razorpayPlaceOrder = async (req, res) => {
  try {
    const {
      userId,
      products,
      addressId,
      paymentMethod,
      couponCode = null,
      paymentDetails = null,
      paymentStatus = 'PENDING',
      orderId = null,
      isRetry = false,
      errorDetails = null
    } = req.body;

    if (!userId || !products || !products.length || !addressId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Fetch user and address in parallel
    const [user, address] = await Promise.all([
      User.findById(userId),
      Address.findOne({ _id: addressId, user: userId })
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    // 🔹 Calculate full order pricing (same as placeOrder)
    const orderCalculation = await calculateOrderPricing(products, couponCode);
    const finalTotalPrice = orderCalculation.totalAmount;

    // 🔹 Build consistent order structure
    const orderData = {
      user: userId,
      products: orderCalculation.productDetails.map(item => ({
        product: item.productId,
        variantSize: item.size,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.finalPrice
      })),
      address: addressId,
      totalPrice: finalTotalPrice,
      shippingFee: orderCalculation.shippingFee,
      couponApplied: orderCalculation.couponDetails?.couponId || null,
      discountAmount: orderCalculation.discountAmount,
      paymentInfo: {
        method: paymentMethod,
        transactionId: paymentDetails?.paymentId || null,
        status: paymentStatus
      },
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...(errorDetails && { failureDetails: errorDetails })
    };

    let order;
    if (orderId && isRetry) {
      // 🔹 Update existing failed order (retry payment)
      order = await Order.findByIdAndUpdate(orderId, orderData, { new: true });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found for retry'
        });
      }
    } else {
      // 🔹 Create new order
      order = new Order(orderData);
      await order.validate();
      await order.save();
    }

    // 🔹 Update stock only if payment succeeded or is pending (not failed)
    if (paymentStatus !== 'FAILED') {
      await Promise.all(orderCalculation.productDetails.map(item =>
        Product.updateOne(
          { _id: item.productId, 'variants.size': item.size },
          { $inc: { 'variants.$.stock': -item.quantity } }
        )
      ));

      // 🔹 Remove ordered items from cart if present
      const cartItemIds = products
        .map(item => item.cartItemId)
        .filter(id => id);

      if (cartItemIds.length > 0) {
        await Cart.deleteMany({
          _id: { $in: cartItemIds },
          user: userId
        });
      }
    }

    res.status(200).json({
      success: true,
      message:
        paymentStatus === 'FAILED'
          ? 'Order saved with failed status'
          : orderId && isRetry
          ? 'Order updated after payment retry'
          : 'Order placed successfully',
      orderId: order._id,
      totalAmount: finalTotalPrice,
      orderDetails: order
    });
  } catch (error) {
    console.error('Razorpay order placement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to place order'
    });
  }
};


const getOrderData = async(req,res)=>{
    try{
        const userId = req.params.id;
        const orders = await Order.find({ 
            user: userId, 
            isDeleted: false 
        })
        .populate({
            path: 'products.product',
            model: 'product', 
            select: 'name price images' 
        })
        .populate({
            path: 'address',
            model: 'Address',
            select: 'Address city state country pincode' 
        })
        .sort({ createdAt: -1 });

        if (!orders || orders.length === 0) {
            return res.status(200).json({
                success: false,
                message: "No orders found for this user"
            });
        }

        const transformedOrders = orders.map(order => ({
            _id: order._id,
            totalPrice: order.totalPrice,
            status: order.paymentInfo.status,
            createdAt: order.createdAt,
             products: order.products
                .map(item => {
                if (!item.product) {
                    return {
                    productName: '[Deleted Product]',
                    quantity: item.quantity,
                    productPrice: item.price || 0,
                    deleted: true
                    };
                }

                return {
                    productName: item.product.name,
                    quantity: item.quantity,
                    productPrice: item.product.price
                };
                })
                .filter(Boolean), 
            paymentMethod: order.paymentInfo.method,
            shippingAddress: order.address,
            expectedDeliveryDate: order.expectedDeliveryDate,
            discountAmount: order.discountAmount,
            shippingFee: order.shippingFee
        }));
        // console.log(transformedOrders)
        
        res.status(200).json({
            success: true,
            count: orders.length,
            orders: transformedOrders
        });
    }catch(error){
        console.error("Detailed Error fetching order data:", {
            message: error.message,
            name: error.name,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: "Internal server error while fetching orders",
            error: process.env.NODE_ENV === 'development' ? error.message : 'Unknown error'
        });
    }
}

const getSingleOrderDetail = async(req,res)=>{
    try{
       const {id} = req.params;

       if(!id){
        return res.status(404).json({
            success:false,
            message:"Order id not found"
        })
       }
       
       const order = await Order.findById(id)
            .lean()
            .populate({
                path: 'products.product', 
                model: 'product',
                populate: {
                    path: 'currentOffer',
                    model: 'offer'
                },
                select: 'name images type category brand description variants currentOffer'
            })
            .populate({
                path: 'address',
                model: 'Address',
                select: '_id fullName Address city state district country pincode phone'
            })
            .populate({
                path: 'couponApplied',
                model: 'coupen',
                select: 'code discount maximumDiscountAmount'
            });

       
       if(!order){
        return res.status(404).json({
            success:false,
            message:"Order not found"
        })
       }

       const products = order.products.map(item => {
         if (!item.product) {
            return {
                _id: null,
                name: 'Product no longer available',
                image: '',
                quantity: item.quantity || 1,
                price: 0,
                finalPrice: 0,
                type: 'N/A',
                brand: 'N/A',
                offerDiscount: 0,
                variantSize: item.variantSize || 'N/A',
                isDeletedProduct: true
             };
         }
        const selectedVariant = item.product?.variants?.find(variant => 
            variant.size.toLowerCase() === item.variantSize?.toLowerCase()
        );
        const basePrice = selectedVariant?.price || 0;
        let finalPrice = basePrice;
        let offerDiscount = 0;

        // Calculate offer discount if applicable
        if (item.product?.currentOffer) {
            const offer = item.product.currentOffer;
            const now = new Date();
            
            if (now >= offer.startDate && now <= offer.endDate) {
                if (offer.discountType === 'PERCENTAGE') {
                    offerDiscount = (basePrice * offer.discountValue) / 100;
                    if (offer.maxDiscountAmount) {
                        offerDiscount = Math.min(offerDiscount, offer.maxDiscountAmount);
                    }
                } else if (offer.discountType === 'FIXED') {
                    offerDiscount = offer.discountValue;
                }
                
                finalPrice = basePrice - offerDiscount;
            }
        }

        return {
            _id: item.product?._id,
            name: item.product?.name || 'Unknown Product',
            image: item.product?.images?.[0] || '/placeholder.svg',
            quantity: item.quantity || 1,
            price: basePrice,
            finalPrice: finalPrice,
            type: item.product?.type || 'N/A',
            brand: item.product?.brand || 'N/A',
            offerDiscount: offerDiscount * item.quantity,
            variantSize: item.variantSize
        };
    });


    const totalOfferDiscounts = products.reduce((sum, product) => sum + product.offerDiscount, 0);
 
    //  coupon discount
    let couponDiscount = 0;
    if (order.couponApplied) {
        const subtotalAfterOffers = products.reduce((sum, product) => 
            sum + (product.finalPrice * product.quantity), 0);
        
        if (order.couponApplied.discount) {
            couponDiscount = (subtotalAfterOffers * order.couponApplied.discount) / 100;
            
            // Apply maximum discount limit if exists
            if (order.couponApplied.maximumDiscountAmount) {
                couponDiscount = Math.min(couponDiscount, order.couponApplied.maximumDiscountAmount);
            }
        }
    }

    const transformedOrder = {
        _id: order._id,
        products: products,
        address: order.address ? {
            _id: order.address._id,
            name: order.address.fullName || 'Not Provided',
            address: `${order.address.Address || ''}, ${order.address.district || ''}, ${order.address.city || ''}, ${order.address.state || ''} - ${order.address.pincode || ''}`.trim(),
            phone: order.address.phone || '',
            email: ''
        } : null,
        totalPrice: order.totalPrice || 0,
        offerDiscounts: totalOfferDiscounts,
        couponDiscount: couponDiscount,
        discountAmount: order.discountAmount || 0,
        status: order.paymentInfo.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        appliedCoupon: order.couponApplied ? {
            code: order.couponApplied.code,
            discount: order.couponApplied.discount
        } : null
    };

       res.status(200).json({
        success:true,
        order:transformedOrder
       })
       
    }catch(error){ 

        console.error("Full Error Details:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code,
            kind: error.kind
        });

        if (error.name === 'CastError') {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal server error while fetching orders",
            error: process.env.NODE_ENV === 'development' ? error.message : 'Unknown error'
        });
    }
}

const cancelOrder = async(req,res)=>{
    try{
        const orderId  = req.params.id;
        const { cancellationReason } = req.body;

        if (!cancellationReason || cancellationReason.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid cancellation reason (minimum 10 characters)'
            });
        }

        const order = await Order.findById(orderId)
            .populate({
                path: 'products.product'
            });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const updatePromises = order.products.map(async (orderProduct) => {
            const product = await Product.findById(orderProduct.product._id);
            
            if (!product) {
                throw new Error(`Product ${orderProduct.product._id} not found`);
            }

             const orderedVariant = product.variants.find(
                variant => variant.size === orderProduct.variantSize
            );

            if (!orderedVariant) {
                throw new Error(`Variant with size ${orderProduct.variantSize} not found for product ${product._id}`);
            }

            orderedVariant.stock += orderProduct.quantity;
            return product.save();
        });

        await Promise.all(updatePromises);


        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
           {
            $set: {
                'paymentInfo.status': 'CANCELED',
                'paymentInfo.cancellationReason': cancellationReason,
                updatedAt: new Date()
                 }
            },
             {new:true}
            );

            if (!updatedOrder) {
                return res.status(404).json({
                  success: false,
                  message: 'Order not found'
                });
              }

              if (order.paymentInfo.method !== 'cod') {
                const shippingFee = 50;
                const totalRefundAmount = order.totalPrice + shippingFee;

                const latestWallet = await Wallet.findOne({ user: order.user })
                .sort({ createdAt: -1 });

                const currentBalance = latestWallet ? latestWallet.balance : 0;
                const newBalance = currentBalance + totalRefundAmount;

                const newWallet = new Wallet({
                    user: order.user,
                    type: 'cancelled',
                    amount: totalRefundAmount,
                    balance: newBalance, 
                    order: orderId
                });
                await newWallet.save();
            }
              res.json({
                success: true,
                message: 'Order cancelled successfully',
                order: updatedOrder
              });

      }catch(error){
            console.error('Error in cancelorder:', error);
            res.status(500).json({
            success: false,
            message: 'Error cancelling order',
            error: error.message
            });
        }
 }

//admin side 
const getOrderDataAdmin = async(req,res)=>{
    try{
        let query = { isDeleted: false };
     
        const orders = await Order.find(query)
        .populate({
            path:'user', 
            select:'firstname lastname',
            model:"User",
            match: { isBlocked: false }
        })
        .populate({
          path: 'products.product',
          select: 'name images',
          model: 'product',
          match: { isDeleted: false }
        })
        .sort({ createdAt: -1 });
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            
            // If user was not found during population (e.g., deleted), 
            // provide a default user object
            if (!orderObj.user) {
                orderObj.user = {
                    firstname: 'Deleted',
                    lastname: 'User'
                };
            }
                 // Handle products where some might have been deleted
                 orderObj.products = orderObj.products.map(product => {
                    if (!product.product) {
                        return {
                            ...product,
                            product: {
                                name: 'Product Unavailable',
                                images: []
                            }
                        };
                    }
                    return product;
                });
    
                return orderObj;
            });


        res.json(processedOrders);

    }catch(error){
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Failed to fetch orders' });
    }
}

const getOrderDetailsAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate({
        path: 'user',
        select: 'firstname lastname email phone'
      })
      .populate({
        path: 'address',
        select: 'fullName city Address country state district pincode'
      })
      .populate({
        path: 'products.product',
        select: 'name category variants images currentOffer'
      })
      .lean();

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Collect all offer IDs and category IDs from products
    const offerIds = [];
    const categoryIds = [];

    order.products.forEach(item => {
      if (item.product?.currentOffer) {
        offerIds.push(item.product.currentOffer);
      }
      if (item.product?.category) {
        categoryIds.push(item.product.category);
      }
    });

    // Fetch active offers in one go
    const now = new Date();
    const [productOffers, categoryOffers] = await Promise.all([
      offerModel.find({
        _id: { $in: offerIds },
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean(),
      offerModel.find({
        applicableTo: 'category',
        targetId: { $in: categoryIds },
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean()
    ]);

    const productDetails = order.products.map((item) => {
      const variant = item.product?.variants.find(
        (v) => v.size === item.variantSize
      );

      let price = variant ? variant.price : 0;

      // Find applicable product or category offer
      const productOffer = productOffers.find(
        (o) => o._id.toString() === item.product?.currentOffer?.toString()
      );
      const categoryOffer = categoryOffers.find(
        (o) => o.targetId.toString() === item.product?.category?.toString()
      );

      const offer = productOffer || categoryOffer;

      // Apply the offer discount if active
      if (offer) {
        let discountAmount = 0;
        if (offer.discountType === 'PERCENTAGE') {
          discountAmount = (price * offer.discountValue) / 100;
        } else if (offer.discountType === 'FIXED') {
          discountAmount = offer.discountValue;
        }

        if (offer.maxDiscountAmount && discountAmount > offer.maxDiscountAmount) {
          discountAmount = offer.maxDiscountAmount;
        }

        price = Math.max(price - discountAmount, 0);
      }

      return {
        productId: item.product?._id,
        productName: item.product?.name,
        image: item.product?.images?.[0] || null,
        size: item.variantSize,
        quantity: item.quantity,
        price, // reduced price after offer
      };
    });

    const orderDetails = {
      orderId: order._id,
      orderStatus: order.paymentInfo?.status || 'PENDING',
      orderDate: order.createdAt,

      user: {
        firstname: order.user?.firstname,
        lastname: order.user?.lastname,
        email: order.user?.email,
        phone: order.user?.phone,
      },

      address: order.address
        ? {
            fullName: order.address.fullName,
            addressLine: order.address.Address,
            city: order.address.city,
            district: order.address.district,
            state: order.address.state,
            country: order.address.country,
            pincode: order.address.pincode,
          }
        : null,

      products: productDetails,

      payment: {
        method: order.paymentInfo?.method,
        status: order.paymentInfo?.status,
      },

      financials: {
        totalPrice: order.totalPrice,
        shippingFee: order.shippingFee,
        discountAmount: order.discountAmount,
      },
    };

    res.status(200).json({ order: orderDetails });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
};


const changeOrderStatus = async(req,res)=>{
    try{
       const {id} = req.params;
       const {status} = req.body;

       const updatedOrder = await Order.findByIdAndUpdate(
        id,
        { 'paymentInfo.status': status },
        { new: true, runValidators: true }
      );

      if (!updatedOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found or status not updated"
        });
      }  

      return res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        data: updatedOrder
      });
    }catch(error){
        console.error('Error updating order status:', error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message
        });
    }
}

const cancelOrderAdmin = async(req,res)=>{
    try{
        const {id} = req.params;
        const {status} = req.body;
        const updatedOrder = await Order.findByIdAndUpdate(id,
            {'paymentInfo.status':status},
            { new: true, runValidators: true }
        )
        console.log(updatedOrder)
        if (!updatedOrder) {
            return res.status(404).json({
              success: false,
              message: "Order not found or order not cancelled"
            });
          }  
          return res.status(200).json({
            success: true,
            message: "Order canceled successfully",
            data: updatedOrder
          });
    }catch(error){
        console.error('Error updating order cancel:', error);
        return res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message
        });
    }
}

//return 
const getOrderForReturn = async (req, res) => {
    try {
      const { orderId } = req.params;
      const userId = req.user._id;
  
      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: 'Invalid order ID' });
      }
  
      const order = await Order.findOne({
        _id: orderId,
        user: userId,
        isDeleted: false
      }).populate([
        {
          path: 'products.product',
          select: 'name images category variants currentOffer',
          populate: [
            {
              path: 'category',
              select: 'name'
            },
            {
              path: 'currentOffer',
              select: 'discountType discountValue maxDiscountAmount'
            }
          ]
        },
        {
          path: 'couponApplied',
          select: 'discount maximumDiscountAmount'
        }
      ]);
  
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      if (order.paymentInfo.status !== 'DELIVERED') {
        return res.status(400).json({ message: 'Only delivered orders can be returned' });
       }
  
      const deliveredAt = order.updatedAt || order.createdAt;
      const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredAt)) / (1000 * 60 * 60 * 24));

      if (daysSinceDelivery > 30) {
        return res.status(400).json({ message: 'Order is no longer eligible for return' });
      }

      const subtotalAfterOffers = order.products.reduce((acc, orderProduct) => {
        const product = orderProduct.product;
        if (!product) return acc;
        const variant = product.variants.find(v => v.size === orderProduct.variantSize);
        if (!variant) return acc;

        let price = variant.price;

        // Apply product offer
        if (product.currentOffer) {
            const offer = product.currentOffer;
            if (offer.discountType === 'PERCENTAGE') {
            const discountAmount = (price * offer.discountValue) / 100;
            price -= Math.min(discountAmount, offer.maxDiscountAmount || discountAmount);
            } else {
            price -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
            }
        }

        return acc + price * orderProduct.quantity;
      }, 0);


      const productsWithFinalPrices = order.products.map(orderProduct => {
        const product = orderProduct.product;
        if (!product) return null;

        const variant = product.variants.find(v => v.size === orderProduct.variantSize);
        if (!variant) return null;

        let finalPrice = variant.price;

        // Apply product offer again for this item
        if (product.currentOffer) {
            const offer = product.currentOffer;
            if (offer.discountType === 'PERCENTAGE') {
            const discountAmount = (finalPrice * offer.discountValue) / 100;
            finalPrice -= Math.min(discountAmount, offer.maxDiscountAmount || discountAmount);
            } else {
            finalPrice -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
            }
        }

        // Apply proportional coupon discount
        if (order.couponApplied && order.discountAmount > 0 && subtotalAfterOffers > 0) {
            const productShare = (finalPrice * orderProduct.quantity) / subtotalAfterOffers;
            const proportionalDiscount = productShare * order.discountAmount;
            finalPrice -= proportionalDiscount / orderProduct.quantity;
        }

        finalPrice = Math.max(0, Math.round(finalPrice * 100) / 100);
        const totalItemPrice = finalPrice * orderProduct.quantity;

        const eligibleForReturn =
            order.paymentInfo.status === 'DELIVERED' &&
            daysSinceDelivery <= 30 &&
            !orderProduct.returnStatus?.isReturned;

        return {
            product: {
            _id: product._id,
            name: product.name,
            images: product.images,
            category: product.category?.name,
            variantSize: orderProduct.variantSize,
            },
            quantity: orderProduct.quantity,
            finalPrice,
            totalItemPrice,
            eligibleForReturn,
        };
      }).filter(Boolean);

  
      res.status(200).json({
        success: true,
        orderId: order._id,
        orderDate: order.createdAt,
        totalPrice: order.totalPrice,
        products: productsWithFinalPrices,
        message: 'Order details fetched successfully for return'
      });
    } catch (error) {
      console.error('Error in getOrderForReturn:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
};

const handleReturnRequest = async (req, res) => {
    try {
      const { orderId, productId } = req.params;
      const { reason } = req.body;
      const userId = req.user._id;
  
      if (!reason) {
        return res.status(400).json({ message: 'Return reason is required' });
      }
  
      const order = await Order.findOne({
        _id: orderId,
        user: userId,
        isDeleted: false
      });
  
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      const productIndex = order.products.findIndex(
        p => p.product.toString() === productId
      );
  
      if (productIndex === -1) {
        return res.status(404).json({ message: 'Product not found in order' });
      }
  
      order.products[productIndex].returnStatus = {
        isReturned: true,
        returnReason: reason,
        returnDate: new Date(),
        adminApproval: false
      };
  
      await order.save();
      res.json({ message: 'Return request submitted successfully' });
    } catch (error) {
      console.error('Error in handleReturnRequest:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

//return requst admin side

const getReturnRequests = async (req, res) => {
    try{
        const orders = await Order.aggregate([
            { $unwind: '$products' },
            { $match: { 'products.returnStatus.isReturned': true } },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userData'
              }
            },
            {
              $lookup: {
                from: 'products',
                localField: 'products.product',
                foreignField: '_id',
                as: 'productData'
              }
            },
            {
              $project: {
                orderId: '$_id',
                productId: '$products.product',
                returnReason: '$products.returnStatus.returnReason',
                returnDate: '$products.returnStatus.returnDate',
                adminApproval: '$products.returnStatus.adminApproval',
                user: { $arrayElemAt: ['$userData', 0] },
                product: { $arrayElemAt: ['$productData', 0] }
              }
            }
          ]);
      
          res.json(orders);
    }catch(error){
        console.error('Error fetching return requests:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

const approveReturnRequest = async (req, res) => {
    try {
      const { orderId, productId } = req.body;
  
      if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order ID' });
      }
  
      const existingOrder = await Order.findOne({
        _id: orderId,
        'products.product': productId
      })
        .populate([
          {
            path: 'products.product',
            select: 'name variants currentOffer',
            populate: {
              path: 'currentOffer',
              select: 'discountType discountValue maxDiscountAmount'
            }
          },
          {
            path: 'couponApplied',
            select: 'discount maximumDiscountAmount'
          }
        ]);
  
      if (!existingOrder) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
  
      const returnedProduct = existingOrder.products.find(
        p => p.product._id.toString() === productId
      );
  
      if (!returnedProduct) {
        return res.status(404).json({ success: false, message: 'Product not found in order' });
      }
  
      if (returnedProduct.returnStatus?.adminApproval) {
        return res.status(400).json({ success: false, message: 'Return request already approved' });
      }
  
      // 🔹 Calculate refund amount using same logic as getOrderForReturn
      const product = returnedProduct.product;
      const variant = product.variants.find(v => v.size === returnedProduct.variantSize);
      if (!variant) {
        return res.status(400).json({ success: false, message: 'Variant not found for product' });
      }
  
      let finalPrice = variant.price;
  
      // 🟢 Apply product offer discount
      if (product.currentOffer) {
        const offer = product.currentOffer;
        if (offer.discountType === 'PERCENTAGE') {
          const discountAmount = (finalPrice * offer.discountValue) / 100;
          finalPrice -= Math.min(discountAmount, offer.maxDiscountAmount || discountAmount);
        } else {
          finalPrice -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
        }
      }
  
      // 🟢 Apply coupon discount proportionally (same logic as return page)
      if (existingOrder.couponApplied && existingOrder.discountAmount > 0) {
        const subtotalBeforeCoupon = existingOrder.totalPrice + existingOrder.discountAmount;
        const maxDiscount =
          existingOrder.couponApplied.maximumDiscountAmount || existingOrder.discountAmount;
        const couponDiscount =
          (finalPrice / subtotalBeforeCoupon) *
          Math.min(existingOrder.discountAmount, maxDiscount);
        finalPrice -= couponDiscount;
      }
  
      finalPrice = Math.max(0, Math.round(finalPrice * 100) / 100);
      const refundAmount = Math.floor(finalPrice * returnedProduct.quantity);
  
      // 🔹 Update return status in order
      await Order.findOneAndUpdate(
        { _id: orderId, 'products.product': productId },
        { $set: { 'products.$.returnStatus.adminApproval': true } },
        { new: true }
      );
  
      // 🔹 Update wallet
      const lastWalletTransaction = await Wallet.findOne({ user: existingOrder.user })
        .sort({ createdAt: -1 });
      const currentBalance = lastWalletTransaction ? lastWalletTransaction.balance : 0;
      const newBalance = currentBalance + refundAmount;
  
      await Wallet.create({
        user: existingOrder.user,
        order: orderId,
        type: 'returned',
        amount: refundAmount,
        balance: newBalance
      });
  
      return res.json({
        success: true,
        message: 'Return request approved successfully',
        refundedAmount: refundAmount
      });
    } catch (error) {
      console.error('Error approving return:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  };

const rateOrder = async (req, res) => {
    try {
      const { orderId, rating, feedback } = req.body;
      
      if (!orderId || !rating) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and rating are required'
        });
      }
  
      const order = await Order.findById(orderId);
      
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found'
        });
      }
  
      // Update the order with rating information
      order.rating = {
        stars: rating,
        feedback: feedback || '',
        createdAt: new Date()
      };
  
      await order.save();
  
      return res.status(200).json({
        success: true,
        message: 'Rating submitted successfully',
        data: order
      });
    } catch (error) {
      console.error('Error in rateOrder:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit rating',
        error: error.message
      });
    }
  };


module.exports = {
    placeOrder,
    getOrderData,
    getOrderDetailsAdmin,
    getSingleOrderDetail,
    cancelOrder,
    getOrderDataAdmin,
    changeOrderStatus,
    cancelOrderAdmin,
    orderAmount,
    razorpayPlaceOrder,
    getOrderForReturn,
    handleReturnRequest,
    getReturnRequests,
    approveReturnRequest,
    rateOrder,
    verifyStock
}