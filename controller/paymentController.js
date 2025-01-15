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
        const { totalAmount  } = req.body;

        if (!totalAmount || isNaN(totalAmount)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount provided'
            });
        }
        const totalWithShipping = totalAmount + 50;
        const amountInPaise = Math.round(totalWithShipping  * 100);

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
