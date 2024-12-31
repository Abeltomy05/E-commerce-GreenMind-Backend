const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
 user: {
     type: mongoose.Schema.Types.ObjectId,
     ref:'User',
     required: true,
   },
  product: {
      type: mongoose.Schema.Types.ObjectId,
      ref:'product',
      required: true,
    },
}, {
  timestamps: true  
});

module.exports = mongoose.models.Wishlist || mongoose.model("wishlist", wishlistSchema);
