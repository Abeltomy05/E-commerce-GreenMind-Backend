const express = require("express");
const userRoute = express.Router();
const {signup,verifyOTP,resendOTP,refreshAccessToken,login,getProductData,getSingleProductData,getUserData} = require("../controller/userController")
const {getProfiledata,updateUserProfile,changePassword,profileImgUpdate,getAdressOfaUser,setNewAddressForUser,updateAddress,deleteAddress} = require('../controller/userDashboard')
const {getCartData,addToCart,getCartDataForCartPage,updateCartItemQuantity,removeCartItem} = require("../controller/cartController")
const {placeOrder,getOrderData,getSingleOrderDetail,cancelOrder} = require("../controller/orderController")
const {verifyJWT} = require("../middleware/authMiddleware");
const {getCategoryName,productTypes,productFilter} = require('../controller/filterController')

userRoute.post("/signup",signup);
userRoute.post("/verifyOTP",verifyOTP)
userRoute.post("/resendOTP",resendOTP)
userRoute.post('/refresh-token', refreshAccessToken);
userRoute.post("/login",login);
userRoute.get("/getproductdata",getProductData);
userRoute.get("/product-view/:id",getSingleProductData);
userRoute.get("/getuserdata/:id",getUserData);
userRoute.get("/profile/:id",getProfiledata)
userRoute.put("/profileupdate/:id",updateUserProfile)
userRoute.put("/change-password/:id",changePassword)
userRoute.put("/profileImageupdate/:id",profileImgUpdate)
//address
userRoute.get("/addressdata/:id",getAdressOfaUser)
userRoute.post("/addnewaddress/:id",setNewAddressForUser)
userRoute.put("/updateaddress/:id",updateAddress)
userRoute.delete("/deleteaddress/:id",deleteAddress)
//cart
userRoute.get("/getcartdata/:id",getCartData)
userRoute.post("/addtocart",addToCart)
userRoute.get("/getcartdataforcartpage/:id",getCartDataForCartPage)
userRoute.patch("/updatequantity/:id",updateCartItemQuantity)
userRoute.delete("/removecartitem/:id",removeCartItem)
//order
userRoute.post("/placeorder",placeOrder)
userRoute.get("/getorderdata/:id",getOrderData)
userRoute.get("/orderdetails/:id",getSingleOrderDetail)
userRoute.post("/cancelorder/:id",cancelOrder)
//filter
userRoute.get('/getcategorynames',getCategoryName)
userRoute.get('/producttypes',productTypes)
userRoute.get('/productsfilter',productFilter)

module.exports = userRoute