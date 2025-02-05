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
        ref: 'product',
        required: true
    },
    variantSize: {
      type: String,
      required: true
  },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    returnStatus: {
      isReturned: { type: Boolean, default: false }, 
      returnReason: { type: String },            
      returnDate: { type: Date },  
      adminApproval: { type: Boolean, default: false},          
    },
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
    enum: ['FAILED','PENDING', 'CONFIRMED', 'CANCELED', 'DELIVERED','ON THE ROAD'],
    default: 'PENDING'
    },
    cancellationReason: {  
      type: String
    }
  },
couponApplied: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'coupen',
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
  },
  rating: {
    stars: Number, 
    feedback: String,
    createdAt: Date
  }
}, {
  timestamps: true  
});

module.exports = mongoose.models.Order || mongoose.model("order", orderSchema);
