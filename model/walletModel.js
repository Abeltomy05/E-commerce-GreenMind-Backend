const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
user: {
       type: mongoose.Schema.Types.ObjectId,
       ref:'User',
       required: true,
     },
order: {
        type: mongoose.Schema.Types.ObjectId,
        ref:'order',
 },     
type: {
    type: String,
    required: true,
    enum:['added','bought','returned','cancelled']
  },
amount: {
    type: Number,
    required: true,
  },
balance:{
    type:Number,
    required:true
  }
}, {
  timestamps: true  
});

module.exports = mongoose.models.Wallet || mongoose.model("wallet", walletSchema);
