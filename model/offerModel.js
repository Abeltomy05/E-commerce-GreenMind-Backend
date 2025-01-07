const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  discountType: {
    type: String,
    enum: ['PERCENTAGE', 'FIXED'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  applicableTo: {
    type: String,
    enum: ['product', 'category'],
    required: true,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'applicableTo',
    required: true,
  },
//   minimumPurchaseAmount: {
//     type: Number,
//     default: 0,
//   },
//   isActive: {
//     type: Boolean,
//     default: true,
//   },
  maxDiscountAmount: {
    type: Number,  
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Offer || mongoose.model("offer", offerSchema);