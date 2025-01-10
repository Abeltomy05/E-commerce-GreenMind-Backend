const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Coupon = require('../model/coupenModel')

const coupenData = async(req,res)=>{
    try{
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.status(200).json(coupons?coupons:[]);
    }catch(error){
        console.error('Error fetching coupons:', error);
        res.status(500).json({ message: 'Error fetching coupons' });
    }
}

const createcoupon = async(req,res)=>{
    try{
        const {
            code,
            discount,
            startDate,
            expiryDate,
            maxUses,
            minimumPurchaseAmount,
            maximumDiscountAmount
        } = req.body;

        if (!code || !discount || !startDate || !expiryDate || !minimumPurchaseAmount || !maximumDiscountAmount) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }
        
        if (discount <= 0 || discount > 100) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 0 and 100'
            });
        }

        const start = new Date(startDate);
        const expiry = new Date(expiryDate);
        const now = new Date();

        if (start > expiry) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be before expiry date'
            });
        }
        if (expiry < now) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be in the future'
            });
        }
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }

        if (minimumPurchaseAmount < 0 || maximumDiscountAmount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum purchase and maximum discount amounts must be positive'
            });
        }

        if (maximumDiscountAmount > minimumPurchaseAmount) {
            return res.status(400).json({
                success: false,
                message: 'Maximum discount cannot be greater than minimum purchase amount'
            });
        }

        const newCoupon = new Coupon({
            code: code.toUpperCase(),
            discount,
            startDate,
            expiryDate,
            maxUses: maxUses || null,
            usageCount: 0,
            minimumPurchaseAmount,
            maximumDiscountAmount
        });

        await newCoupon.save();

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });
    }catch(error){
        console.error('Error creating coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}
const deletecoupon = async(req,res)=>{
    try{
        const couponId = req.params.id;
        const deletedCoupon = await Coupon.findByIdAndDelete(couponId);
        if (!deletedCoupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    }catch(error){
        console.error('Error deleting coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

//user side

const displayCoupons = async(req,res)=>{
    try {
        const orderAmount = parseFloat(req.query.orderAmount) || 0;
        const currentDate = new Date();

        const query = {
            startDate: { $lte: currentDate },
            expiryDate: { $gte: currentDate },
            minimumPurchaseAmount: { $lte: orderAmount },
            $expr: { $lt: ["$usageCount", "$maxUses"] }
            };
           
    
            const coupons = await Coupon.find(query);
         
    
        res.json({
          success: true,
          coupons: coupons.map(coupon => ({
            code: coupon.code,
            discount: `${coupon.discount}% off`,
            minimumPurchaseAmount: coupon.minimumPurchaseAmount,
            maximumDiscountAmount: coupon.maximumDiscountAmount
          }))
        });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch coupons' });
      }
}

const applyCoupen = async(req,res)=>{
    try {
        const { code, orderAmount } = req.query;
        const numericOrderAmount = Number(orderAmount);

        if (isNaN(numericOrderAmount)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid order amount'
            });
          }

        const currentDate = new Date();
    
        const coupon = await Coupon.findOne({
          code,
          startDate: { $lte: currentDate },
          expiryDate: { $gte: currentDate },
          minimumPurchaseAmount: { $lte: numericOrderAmount  },
          $expr: { $lt: ["$usageCount", "$maxUses"] }
        });
    
    
        if (!coupon) {
          return res.status(400).json({
            success: false,
            message: 'Invalid or expired coupon'
          });
        }
    
        let discountAmount = (numericOrderAmount  * coupon.discount / 100);
        discountAmount = Math.min(discountAmount, coupon.maximumDiscountAmount);
    
        await Coupon.findByIdAndUpdate(coupon._id, {
          $inc: { usageCount: 1 }
        });
    
        res.json({
          success: true,
          discountAmount,
          finalAmount: numericOrderAmount  - discountAmount
        });
      } catch (error) {
        console.error('Coupon application error:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to apply coupon'
        });
      }
}

module.exports = {
    coupenData,
    createcoupon,
    deletecoupon,
    displayCoupons,
    applyCoupen
}