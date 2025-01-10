const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Wishlist = require('../model/wishlistModel')
const Offer = require('../model/offerModel')


const addToWishlist = async (req, res) => {
    try {
      const { product } = req.body;
      const userId = req.user._id;
  
      const existingItem = await Wishlist.findOne({ user: userId, product });
      if (existingItem) {
        return res.status(400).json({ message: 'Product already in wishlist' });
      }
  
      await Wishlist.create({ user: userId, product });
      res.status(200).json({ message: 'Added to wishlist' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  const removeFromWishlist = async (req, res) => {
    try {
      const productId = req.params.productId;
      const userId = req.user._id;
  
      await Wishlist.findOneAndDelete({ user: userId, product: productId });
      res.status(200).json({ message: 'Removed from wishlist' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  const checkWishlist = async (req, res) => {
    try {
      const productId = req.params.productId;
      const userId = req.user._id;
  
      const item = await Wishlist.findOne({ user: userId, product: productId });
      res.json({ isInWishlist: !!item });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  const getWishlist = async (req, res) => {
    try {
      const userId = req.user._id;
      const wishlist = await Wishlist.find({ user: userId })
      .populate({
          path: 'product',
          select: 'name images variants isDeleted currentOffer',
          match: { isDeleted: false },
          populate: {
              path: 'currentOffer',
              select: 'discountType discountValue maxDiscountAmount'
          }
      });
  
      // Filter out items where product is null (due to isDeleted match)
      const activeWishlist = wishlist.filter(item => item.product !== null);
      console.log(activeWishlist)
      res.json(activeWishlist);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  module.exports = {
    addToWishlist,
    removeFromWishlist,
    checkWishlist,
    getWishlist
  };