const { request } = require('express');
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:'User',
      required: true,
    },
products: [{
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    }
      }],
address:{
     type:mongoose.Schema.Types.ObjectId,
     ref:'Address',
    required: true,
    },    
totalPrice: { 
    type: Number, 
    required:true,
    min:0 
  },
isDeleted:{
    type:Boolean,
    default:false
  },
paymentInfo: {
  method: {
    type: String,
    enum: ['cod', 'credit-card', 'razorpay'],
    required: true
   },
   transactionId: {
    type: String
   },
   status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'CANCELED', 'DELIVERED','ON THE ROAD'],
    default: 'PENDING'
    }
  },
couponApplied: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
shippingFee: {
    type: Number,
    default: 0
  },   
discountAmount: {
    type: Number,
    default: 0
  },
expectedDeliveryDate: {
    type: Date
  }
}, {
  timestamps: true  
});

module.exports = mongoose.models.Order || mongoose.model("order", orderSchema);
