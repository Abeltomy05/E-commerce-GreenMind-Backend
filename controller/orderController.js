const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Address = require('../model/addressModel')
const Order = require('../model/orderSchema')

const placeOrder = async(req,res)=>{
    try{
        const { 
            userId, 
            products, 
            addressId, 
            totalPrice, 
            paymentMethod, 
            couponCode,
            shippingFee = 0,
        } = req.body;

        if (!userId || !products || !addressId || !paymentMethod) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required order details' 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(404).json({ 
                success: false, 
                message: 'Address not found' 
            });
        }

        const validatedProducts = [];
        let calculatedTotalPrice = 0;

        for (const item of products) {

            if (!item.product || !item.quantity || !item.size) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid product item structure. Ensure product, size, and quantity are provided.' 
                });
            }

            const product = await Product.findById(item.product);
            
            if (!product) {
                return res.status(404).json({ 
                    success: false, 
                    message: `Product with ID ${item.product} not found` 
                });
            } 

            const variant = product.variants.find(v => v.size === item.size);

            if (!variant) {
                return res.status(404).json({ 
                    success: false, 
                    message: `Variant with ID ${item.variant} not found for product ${product.name}` 
                });
            }

            const quantity = Number(item.quantity);
            if (isNaN(quantity) || quantity <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Invalid quantity for product ${product.name}` 
                });
            }

            // if (variant.stock < quantity) {
            //     return res.status(400).json({ 
            //         success: false, 
            //         message: `Insufficient stock for product ${product.name}` 
            //     });
            // }

            const variantPrice = Number(variant.price);
            if (variantPrice === 0 || isNaN(variantPrice)) {
                return res.status(500).json({ 
                    success: false, 
                    message: `Invalid price for product ${product.name}, variant ${variant.size}. Price: ${variant.price}` 
                });
            }

            const productTotal = variantPrice * quantity;
            calculatedTotalPrice += productTotal;
         
            validatedProducts.push({
                 product: product._id,
                variantSize: variant.size,
                variantId: variant._id,
                quantity: quantity,
                price: variantPrice,
                cartItemId: item.cartItemId
            });       
        }


        const finalTotalPrice = Number(calculatedTotalPrice + shippingFee);

        if (isNaN(finalTotalPrice)) {
            console.error('Final total price calculation failed', {
                calculatedTotalPrice,
                shippingFee
            });
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to calculate order total' 
            });
        }   

        const orderData = {
            user: userId,
            products: validatedProducts,
            address: addressId,
            totalPrice: finalTotalPrice,
            paymentInfo: {
                method: paymentMethod,
                status: 'PENDING'
            },
            shippingFee,
            couponApplied: null,
            discountAmount: 0,
            expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        };
        const order = new Order(orderData);

        try {
            await order.validate();
        } catch (validationError) {
            console.error('Order validation failed:', validationError);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid order data',
                error: validationError.message 
            });
        }

        await order.save();

        for (const item of validatedProducts) {
            await Product.updateOne(
                { _id: item.product, 'variants.size': item.variantSize },
                { $inc: { 'variants.$.stock': -item.quantity } }
            );
        }

        const cartItemIds = validatedProducts.map(item => item.cartItemId).filter(id => id);

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

    }catch(error){
        console.error('Order placement error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to place order',
            error: error.message 
        });
    }
}

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
            return res.status(404).json({
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
        select: 'name images type category brand description variants' 
        })
        .populate({
            path: 'address', 
            model: 'Address',
            select: 'fullName Address city state district country pincode phone' 
        });

 
       
       if(!order){
        return res.status(404).json({
            success:false,
            message:"Order not found"
        })
       }


       const transformedOrder = {
        _id: order._id,
        products: order.products.map(item => ({
            _id: item.product?._id,
            name: item.product?.name || 'Unknown Product',
            image: item.product?.images?.[0] || '/placeholder.svg',
            quantity: item.quantity || 1,
            price: item.product?.variants?.[0]?.price || 0,
            type: item.product?.type,
            brand: item.product?.brand
        })),
        address: order.address ? {
            name: order.address.fullName || 'Not Provided',
            address: `${order.address.Address || ''}, ${order.address.district || ''}, ${order.address.city || ''}, ${order.address.state || ''} - ${order.address.pincode || ''}`.trim(),
            phone: order.address.phone || '',
            email: ''  // Add email if available in your schema
        } : null,
        totalPrice: order.totalPrice || 0,
        status:order.paymentInfo.status,
        createdAt: order.createdAt
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
        console.log("order id:", orderId);
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
           {
            $set: {
                'paymentInfo.status': 'CANCELED',
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
            model:"User"
        })
        .populate({
          path: 'products.product',
          select: 'name images',
          model: 'product'
        })
        .sort({ createdAt: -1 });


        res.json(orders);

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


module.exports = {
    placeOrder,
    getOrderData,
    getSingleOrderDetail,
    cancelOrder,
    getOrderDataAdmin,
    changeOrderStatus,
    cancelOrderAdmin
}