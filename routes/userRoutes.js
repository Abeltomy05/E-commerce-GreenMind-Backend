const express = require("express");
const userRoute = express.Router();
const {signup,verifyOTP,resendOTP,refreshAccessToken,login,getProductData,getSingleProductData,getUserData} = require("../controller/userController")
const {getProfiledata,updateUserProfile,changePassword,profileImgUpdate,getAdressOfaUser,setNewAddressForUser,updateAddress,deleteAddress} = require('../controller/userDashboard')
const {getCartData,addToCart,getCartDataForCartPage,updateCartItemQuantity,removeCartItem} = require("../controller/cartController")
const {placeOrder,getOrderData,getSingleOrderDetail,cancelOrder,orderAmount,razorpayPlaceOrder,getOrderForReturn,handleReturnRequest} = require("../controller/orderController")
const {verifyJWT} = require("../middleware/authMiddleware");
const {checkUserBlock} = require('../middleware/checkUserBlock')
const {getCategoryName,productTypes,productFilter} = require('../controller/filterController')
const { addToWishlist,removeFromWishlist,checkWishlist,getWishlist} = require('../controller/wishlistController')

userRoute.post("/signup",signup);
userRoute.post("/verifyOTP",verifyOTP)
userRoute.post("/resendOTP",resendOTP)
userRoute.post('/refresh-token', refreshAccessToken);
userRoute.post("/login",login);
userRoute.get("/getproductdata",verifyJWT,getProductData);
userRoute.get("/product-view/:id",verifyJWT,getSingleProductData);
userRoute.get("/getuserdata/:id",verifyJWT,getUserData);
userRoute.get("/profile/:id",verifyJWT,getProfiledata)
userRoute.put("/profileupdate/:id",verifyJWT,updateUserProfile)
userRoute.put("/change-password/:id",verifyJWT,changePassword)
userRoute.put("/profileImageupdate/:id",verifyJWT,profileImgUpdate)
//address
userRoute.get("/addressdata/:id",verifyJWT,getAdressOfaUser)
userRoute.post("/addnewaddress/:id",verifyJWT,setNewAddressForUser)
userRoute.put("/updateaddress/:id",verifyJWT,updateAddress)
userRoute.delete("/deleteaddress/:id",verifyJWT,deleteAddress)
//cart
userRoute.get("/getcartdata/:id",verifyJWT,getCartData)
userRoute.post("/addtocart",verifyJWT,checkUserBlock,addToCart)
userRoute.get("/getcartdataforcartpage/:id",verifyJWT,checkUserBlock,getCartDataForCartPage)
userRoute.patch("/updatequantity/:id",verifyJWT,updateCartItemQuantity)
userRoute.delete("/removecartitem/:id",verifyJWT,removeCartItem)
//order
userRoute.post("/placeorder",verifyJWT,placeOrder)
userRoute.get("/getorderdata/:id",verifyJWT,getOrderData)
userRoute.get("/orderdetails/:id",verifyJWT,getSingleOrderDetail)
userRoute.post("/cancelorder/:id",verifyJWT,cancelOrder)
userRoute.post('/calculateOrderAmount',verifyJWT,orderAmount)
userRoute.post('/razorpayplaceorder',verifyJWT,razorpayPlaceOrder)
//filter
userRoute.get('/getcategorynames',verifyJWT,getCategoryName)
userRoute.get('/producttypes',verifyJWT,productTypes)
userRoute.get('/productsfilter',verifyJWT,productFilter)
//wishlist
userRoute.post('/add-wishlist', verifyJWT, addToWishlist);
userRoute.delete('/remove-wishlist/:productId', verifyJWT, removeFromWishlist);
userRoute.get('/check-wishlist/:productId', verifyJWT, checkWishlist);
userRoute.get('/wishlist', verifyJWT, getWishlist);
//return
userRoute.get('/getorderforreturn/:orderId',verifyJWT,getOrderForReturn)
userRoute.post('/handlereturn/:orderId/:productId',verifyJWT,handleReturnRequest)
module.exports = userRoute