const express = require("express")
const paymentRoute = express.Router()
const Razorpay = require('razorpay')
const crypto = require('crypto')
const {razorpayorder,razorpaypaymentverify} = require('../controller/paymentController')

paymentRoute.post('/razorpay',razorpayorder);
paymentRoute.post('/razorpaypaymentverify',razorpaypaymentverify);



module.exports = paymentRoute;