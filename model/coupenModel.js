const mongoose = require('mongoose');

const CoupenSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
  },
  discount: {
    type: Number,
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
    trim:true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  maxUses: {
    type: Number,
  },
  usageCount: {
    type: Number,
  },
  minimumPurchaseAmount: {
    type: Number,
    required: true, 
  },
  maximumDiscountAmount: {
    type: Number,
    required: true, 
  },
//   isActive: {
//     type: Boolean,
//     default: true
//   },
}, {
  timestamps: true  
});

module.exports = mongoose.models.Coupen || mongoose.model("coupen", CoupenSchema);
