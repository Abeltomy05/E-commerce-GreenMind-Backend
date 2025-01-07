const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  isActive: { 
    type: Boolean, 
    default: false 
  },
  description: {
    type: String,
  },
  currentOffer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer'
  }
}, {
  timestamps: true  
});

module.exports = mongoose.models.Category || mongoose.model("category", categorySchema);
