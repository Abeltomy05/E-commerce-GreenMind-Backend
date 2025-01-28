const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Address = require('../model/addressModel')
const Order = require('../model/orderSchema')
const Coupon = require('../model/coupenModel')
const Wallet = require('../model/walletModel')


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

const razorpayPlaceOrder = async(req,res)=>{
    try {
        const {
            userId,
            products,
            addressId,
            totalPrice,
            paymentMethod,
            couponCode = null,
            paymentDetails = null,
            paymentStatus = 'PENDING',
            orderId = null,
            isRetry = false,
            errorDetails = null
        } = req.body;


        if (!userId || !products || !products.length || !addressId || !totalPrice || !paymentMethod) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const address = await Address.findOne({
            _id: addressId,
            user: userId
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Shipping address not found'
            });
        }

        const orderProducts = [];
        const cartItemsToDelete = [];


        for (const item of products) {
            const product = await Product.findById(item.product);
            if (!product || product.isDeleted) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found: ${item.product}`
                });
            }

            const variant = product.variants.find(v => v.size === item.size);
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: `Size ${item.size} not found for product ${product.name}`
                });
            }

          
            
            orderProducts.push({
                product: item.product,
                quantity: item.quantity,
                variantSize: item.size
            });
            
            if (item.cartItemId && paymentStatus !== 'FAILED') {
                cartItemsToDelete.push(item.cartItemId);
            }
        }

        let couponId = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ 
                code: couponCode,
                startDate: { $lte: new Date() },
                expiryDate: { $gte: new Date() }
            });
            if (coupon) {
                couponId = coupon._id;
            }
        }

        const expectedDeliveryDate = new Date();
        expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);

   
        let order;
        if (orderId) {
            order = await Order.findByIdAndUpdate(orderId, {
                products: orderProducts,
                address: addressId,
                totalPrice: totalPrice,
                paymentInfo: {
                    method: paymentMethod,
                    transactionId: paymentDetails?.paymentId || null,
                    status: paymentStatus 
                },
                couponApplied: couponId,
                expectedDeliveryDate,
                ...(errorDetails && { failureDetails: errorDetails })
            }, { new: true });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

        } else {
            order = new Order({
                user: userId,
                products: orderProducts,
                address: addressId,
                totalPrice: totalPrice,
                paymentInfo: {
                    method: paymentMethod,
                    transactionId: paymentDetails?.paymentId || null,
                    status: paymentStatus 
                },
                couponApplied: couponId,
                expectedDeliveryDate
            });
            await order.save();
        }

        if (paymentStatus !== 'FAILED') {
            for (const item of products) {
                await Product.updateOne(
                    { 
                        _id: item.product,
                        "variants.size": item.size
                    },
                    { 
                        $inc: { "variants.$.stock": -item.quantity }
                    }
                );
            }

     
        if (cartItemsToDelete.length > 0) {
            await Cart.deleteMany({
                _id: { $in: cartItemsToDelete },
                user: userId
            });
        }
    }

        res.status(200).json({
            success: true,
            message:  paymentStatus === 'FAILED' ? 'Order saved with failed status' : 'Order placed successfully',
            orderId: order._id,
            orderDetails: order
        });

    } catch(error) {
        console.error('Order placement detailed error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            success: false,
            message: 'Failed to place order',
            errorType: error.name,
            errorDetails: error.message
        });
    }
};

// const razorpayPlaceOrderForFailedPayment = async(req,res)=>{
//     try {
//         const {
//             userId,
//             products,
//             addressId,
//             totalPrice,
//             paymentMethod,
//             couponCode = null,
//             paymentDetails = null,
//             paymentStatus = 'PENDING',
//             orderId = null
//         } = req.body;


//         if (!userId || !products || !products.length || !addressId || !totalPrice || !paymentMethod) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Missing required fields'
//             });
//         }

//         const address = await Address.findOne({
//             _id: addressId,
//             user: userId
//         });

//         if (!address) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Shipping address not found'
//             });
//         }

//         const orderProducts = [];
//         const cartItemsToDelete = [];


//         for (const item of products) {
//             const product = await Product.findById(item.product);
//             if (!product || product.isDeleted) {
//                 return res.status(404).json({
//                     success: false,
//                     message: `Product not found: ${item.product}`
//                 });
//             }

//             const variant = product.variants.find(v => v.size === item.size);
//             if (!variant) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Size ${item.size} not found for product ${product.name}`
//                 });
//             }

          
            
//             orderProducts.push({
//                 product: item.product,
//                 quantity: item.quantity,
//                 variantSize: item.size
//             });
            
//             if (item.cartItemId && paymentStatus !== 'FAILED') {
//                 cartItemsToDelete.push(item.cartItemId);
//             }
//         }

//         let couponId = null;
//         if (couponCode) {
//             const coupon = await Coupon.findOne({ 
//                 code: couponCode,
//                 startDate: { $lte: new Date() },
//                 expiryDate: { $gte: new Date() }
//             });
//             if (coupon) {
//                 couponId = coupon._id;
//             }
//         }

//         const expectedDeliveryDate = new Date();
//         expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);

   
//         let order;
//         if (orderId) {
//             order = await Order.findByIdAndUpdate(orderId, {
//                 products: orderProducts,
//                 address: addressId,
//                 totalPrice: totalPrice,
//                 paymentInfo: {
//                     method: paymentMethod,
//                     transactionId: paymentDetails?.paymentId || null,
//                     status: paymentStatus 
//                 },
//                 couponApplied: couponId,
//                 expectedDeliveryDate
//             }, { new: true });

//             if (!order) {
//                 return res.status(404).json({
//                     success: false,
//                     message: 'Order not found'
//                 });
//             }

//         } else {
//             order = new Order({
//                 user: userId,
//                 products: orderProducts,
//                 address: addressId,
//                 totalPrice: totalPrice,
//                 paymentInfo: {
//                     method: paymentMethod,
//                     transactionId: paymentDetails?.paymentId || null,
//                     status: paymentStatus 
//                 },
//                 couponApplied: couponId,
//                 expectedDeliveryDate
//             });
//             await order.save();
//         }

//         if (paymentStatus !== 'FAILED') {
//             for (const item of products) {
//                 await Product.updateOne(
//                     { 
//                         _id: item.product,
//                         "variants.size": item.size
//                     },
//                     { 
//                         $inc: { "variants.$.stock": -item.quantity }
//                     }
//                 );
//             }

     
//         if (cartItemsToDelete.length > 0) {
//             await Cart.deleteMany({
//                 _id: { $in: cartItemsToDelete },
//                 user: userId
//             });
//         }
//     }

//         res.status(200).json({
//             success: true,
//             message:  paymentStatus === 'FAILED' ? 'Order saved with failed status' : 'Order placed successfully',
//             orderId: order._id,
//             orderDetails: order
//         });

//     } catch(error) {
//         console.error('Order placement detailed error:', {
//             message: error.message,
//             stack: error.stack,
//             name: error.name
//         });
//         res.status(500).json({
//             success: false,
//             message: 'Failed to place order',
//             errorType: error.name,
//             errorDetails: error.message
//         });
//     }
// };

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
            products: order.products.map(item => ({
                productName: item.product.name,
                quantity: item.quantity,
                productPrice: item.product.price
            })),
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
            type: item.product?.type,
            brand: item.product?.brand,
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
  
      if (!order.paymentInfo || !order.paymentInfo.status) {
        return res.status(400).json({ message: 'Invalid order status' });
      }
  
      const orderDate = new Date(order.createdAt);
      const today = new Date();
      const daysSinceOrder = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));
  
      if (daysSinceOrder > 30) {
        return res.status(400).json({ message: 'Order is no longer eligible for return' });
      }
  
      if (order.paymentInfo.status !== 'DELIVERED') {
        return res.status(400).json({ message: 'Only delivered orders can be returned' });
      }
  
      // Calculate final prices with offers and coupon
      const productsWithFinalPrices = order.products.map(orderProduct => {
        const product = orderProduct.product;
        const variant = product.variants[0];
        let finalPrice = variant.price;
  
        // Apply product offer if exists
        if (product.currentOffer) {
          const offer = product.currentOffer;
          if (offer.discountType === 'PERCENTAGE') {
            const discountAmount = (finalPrice * offer.discountValue) / 100;
            finalPrice -= Math.min(discountAmount, offer.maxDiscountAmount || discountAmount);
          } else {
            finalPrice -= Math.min(offer.discountValue, offer.maxDiscountAmount || offer.discountValue);
          }
        }
  
        // Apply coupon discount proportionally if exists
        if (order.couponApplied) {
          const couponDiscount = (finalPrice / order.totalPrice) * Math.min(
            order.discountAmount,
            order.couponApplied.maximumDiscountAmount
          );
          finalPrice -= couponDiscount;
        }
  
        return {
          ...orderProduct.toObject(),
          finalPrice: Math.round(finalPrice * 100) / 100
        };
      });
  
      res.json({
        ...order.toObject(),
        products: productsWithFinalPrices
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

        const existingOrder = await Order.findOne({
            _id: orderId,
            'products.product': productId
        });
        
        if (!existingOrder) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found' 
            });
        }

        const returnedProduct = existingOrder.products.find(
            p => p.product.toString() === productId
        );

        if (!returnedProduct) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found in order' 
            });
        }

        if (returnedProduct.returnStatus.adminApproval) {
            return res.status(400).json({ 
                success: false, 
                message: 'Return request already approved' 
            });
        }

        // const existingRefund = await Wallet.findOne({
        //     order: orderId,
        //     type: 'returned'
        // });

        // if (existingRefund) {
        //     return res.status(400).json({ 
        //         success: false, 
        //         message: 'Refund has already been processed for this return' 
        //     });
        // }

        const order = await Order.findOneAndUpdate(
            { 
                _id: orderId,
                'products.product': productId
            },
            {
                $set: {
                    'products.$.returnStatus.adminApproval': true,
                }
            },
            { new: true }
        );
    
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

            const productPrice = order.totalPrice / order.products.length;
            const refundAmount = productPrice - (order.discountAmount / order.products.length);

            const lastWalletTransaction = await Wallet.findOne({ user: order.user })
                .sort({ createdAt: -1 });

            const currentBalance = lastWalletTransaction ? lastWalletTransaction.balance : 0;
            const newBalance = currentBalance + refundAmount;  

            await Wallet.create({
                user: order.user,
                order: orderId,
                type: 'returned',
                amount: refundAmount,
                balance: newBalance
            });


        return res.json({ 
            success: true, 
            message: 'Return request approved successfully',
            // refunded: order.paymentInfo.method !== 'cod'
        });

    } catch(error) {
        console.error('Error approving return:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
}

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
}