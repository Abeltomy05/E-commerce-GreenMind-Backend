const mongoose = require('mongoose');
const express =require("express");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Product = require('../model/productModel');
const Coupon = require('../model/coupenModel');


const razorpayorder = async(req,res)=>{
    try{
        const instance = new Razorpay({
            key_id:process.env.RZP_KEY_ID,
            key_secret:process.env.RZP_KEY_SECRET
        })
        const { products, couponCode } = req.body;
        let totalAmount = 0;

        for (const item of products) {
            // Fetch product from database to get current price
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
                    success:false,
                    message: `Size ${item.size} not found for product ${product.name}` 
                });
            }
            totalAmount += variant.price * item.quantity;

        }

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
        }
        // Create Razorpay order
        const order = await instance.orders.create(options);
        res.status(200).json({
            success: true,
            order,
            amount: amountInPaise,
            discountAmount
        });

    }catch(error){
        console.error("Razorpay order creation error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
   }
}

const razorpaypaymentverify = async(req,res)=>{
    try{
       const{
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderDetails
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Missing payment verification parameters"
            });
        }

            const sign = `${razorpay_order_id}|${razorpay_payment_id}`;

            const expectedSign  = crypto
            .createHmac('sha256',process.env.RZP_KEY_SECRET)
            .update(sign)
            .digest('hex');

            // Verify the signature
            if (razorpay_signature === expectedSign) {
                res.status(200).json({
                    success: true,
                    message: "Payment verified successfully",
                    data: {
                        orderId: razorpay_order_id,
                        paymentId: razorpay_payment_id
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: "Payment verification failed. Invalid signature!"
                });
            }
    }catch(error){
        console.error("Payment verification error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during payment verification",
            error: error.message
        });
    }
}

module.exports = {
    razorpayorder,
    razorpaypaymentverify
}
