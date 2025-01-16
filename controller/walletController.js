 const express =require("express")
 const bcrypt = require('bcrypt');
 const User = require("../model/userModel");
 const Address = require('../model/addressModel')
 const Product = require('../model/productModel')
 const Order = require('../model/orderSchema')
 const Wallet = require('../model/walletModel')

const walletDetails = async(req,res)=>{
    try{
    const userId = req.user._id;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required"
        });
    }
    const transactions = await Wallet.find({ user: userId })
    .sort({ createdAt: -1 })

    const currentBalance = transactions.length > 0 ? transactions[0].balance : 0;

        const formattedTransactions = transactions.map(transaction => ({
            _id: transaction._id,
            type: transaction.type,
            amount: transaction.amount,
            balance: transaction.balance,
            createdAt: transaction.createdAt,
            order: transaction.order,
        }));

        return res.status(200).json({
            success: true,
            data: {
                currentBalance,
                transactions: formattedTransactions,
                totalTransactions: transactions.length
            }
        });
        }catch(error){
            console.error('Error in walletDetails:', error);
            return res.status(500).json({
                success: false,
                message: "Error fetching wallet details",
                error: error.message
            });
             }
 }
 module.exports = {
     walletDetails
}