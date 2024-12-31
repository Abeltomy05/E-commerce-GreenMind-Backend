const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')


const getCartData = async (req, res) => {
    try {
      const { id } = req.params;
      console.log(id)
      const cartItems = await Cart.find({ user: id })
        .populate({
          path: 'product',
          select: 'name variants images category',
          populate: {
            path: 'category',
            select: 'name' 
          }
        })
        .lean();
  
      res.status(200).json({
        success: true,
        items: cartItems
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to retrieve cart items',
        error: error.message 
      });
    }
  };

  const addToCart = async (req, res) => {
    try {
  console.log(req.body)
      const { 
        user, 
        product, 
        variant, 
        quantity,
      } = req.body;
  
  
      if (!user || !product) {
        return res.status(400).json({ 
          success: false, 
          message: 'User and Product are required' 
        });
      }
  
      const currentCartCount = await Cart.countDocuments({ user });
      if (currentCartCount >= 5) {
        return res.status(400).json({
          success: false,
          message: 'Cart limit reached. Maximum 5 different products allowed in cart.',
          cartLimitReached: true
        });
      }

      const existingProduct = await Product.findById(product);
      if (!existingProduct) {
        return res.status(404).json({ 
          success: false, 
          message: 'Product not found' 
        });
      }
  
      const productVariant = existingProduct.variants.find(
        v => v.size === variant.size
      );
  
      if (!productVariant) {
        return res.status(400).json({ 
          success: false, 
          message: 'Selected variant not found' 
        });
      }
  
      if (quantity > productVariant.stock) {
        return res.status(200).json({
          success: true,
          inSufficientStock: true,
          message: `Insufficient stock. Only ${productVariant.stock} available.`,
          availableStock: productVariant.stock
        });
      }

      const existingCartItem = await Cart.findOne({ 
        user, 
        product,
        'variant.size': variant.size 
      });
  
      if (existingCartItem) {
        return res.status(200).json({ 
          success: true, 
          itemExists:true,
          message: 'Product already in cart'
        });
      }
  
      // Create new cart item
      const newCartItem = new Cart({
        user,
        product,
        quantity,
        variant: {
          size: variant.size,
          price: variant.price
        }
      });
      await newCartItem.save();
  
      res.status(201).json({
        success: true,
        message: 'Product added to cart',
        data: newCartItem
      });
  
    } catch (error) {
      console.error('Add to Cart Error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to add product to cart',
        error: error.message 
      });
    }
  };
  
  const getCartDataForCartPage = async(req,res)=>{
    try{
      const userId = req.params.id;

      const cartItems = await Cart.find({ user: userId })
      .populate({
        path: 'product',
        select: 'name images variants' 
      })
      .lean();

      const formattedCartItems = cartItems.map(item => ({
        id: item._id,
        name: item.product.name,
        price: item.variant.price,
        size: item.variant.size,
        quantity: item.quantity,
        image: item.product.images[0], 
        checked: true, 
        productId: item.product._id,
      }));

      res.status(200).json({
        success: true,
        data: formattedCartItems
      });
    }catch(error){
      console.error('Error fetching cart items:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cart items',
        error: error.message
      });
    }
  }

  const updateCartItemQuantity = async (req, res) => {
    try {

      const { id } = req.params;
      const { quantity, userId } = req.body;

      if (!id || !userId || quantity === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

  
      const cartItem = await Cart.findOne({ _id: id, user: userId })
        .populate({
          path: 'product',
          select: 'variants'
        });
  

      if (!cartItem.product) {
        console.log('Product not found for cart item');
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
  
      // Find the specific variant
      const variant = cartItem.product.variants.find(v => 
        v.size === cartItem.variant.size && v.price === cartItem.variant.price
      );

      if (!variant) {
        console.log('Variant not found:', {
          variantId: cartItem.variant,
          availableVariants: cartItem.product.variants
        });
        return res.status(404).json({
          success: false,
          message: 'Product variant not found'
        });
      }
  
      // Check stock limit
      if (quantity > variant.stock) {
        return res.status(200).json({
          success: false,
          message: `Only ${variant.stock} items available in stock`,
          availableStock: variant.stock
        });
      }

    
  
      // Update the cart item
      const updatedCartItem = await Cart.findOneAndUpdate(
        { _id: id, user: userId },
        { quantity },
        { new: true }
      );

      if (!updatedCartItem) {
        console.log('Failed to update cart item');
        return res.status(500).json({
          success: false,
          message: 'Failed to update cart item'
        });
      }
  
      res.status(200).json({
        success: true,
        data: updatedCartItem,
        availableStock: variant.stock
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update cart item',
        error: error.message
      });
    }
  };

  const removeCartItem = async (req, res) => {     
    try {       
      const { id } = req.params;       
      const { userId } = req.body;  
          
      if (!id || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

      const cartItem = await Cart.findOneAndDelete({          
        _id: id,          
        user: userId        
      });          
      
      if (!cartItem) {         
        return res.status(404).json({           
          success: false,           
          message: 'Cart item not found'         
        });       
      }          
      
      res.status(200).json({         
        success: true,         
        message: 'Item removed from cart'       
      });     
    } catch (error) {       
      res.status(500).json({         
        success: false,         
        message: 'Failed to remove cart item',         
        error: error.message       
      });     
    }   
  };
module.exports = {
    getCartData,
    addToCart,
    getCartDataForCartPage,
    updateCartItemQuantity,
    removeCartItem
}