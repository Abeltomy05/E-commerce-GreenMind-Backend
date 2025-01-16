const express = require("express");
const userRoute = express.Router();
const {signup,verifyOTP,resendOTP,refreshAccessToken,login,getProductData,getActiveOffers,getSingleProductData,getUserData,getRelatedProducts} = require("../controller/userController")
const {getProfiledata,updateUserProfile,changePassword,profileImgUpdate,getAdressOfaUser,setNewAddressForUser,updateAddress,deleteAddress,addAddressInCheckout} = require('../controller/userDashboard')
const {getCartData,addToCart,getCartDataForCartPage,updateCartItemQuantity,removeCartItem} = require("../controller/cartController")
const {placeOrder,getOrderData,getSingleOrderDetail,cancelOrder,orderAmount,razorpayPlaceOrder,getOrderForReturn,handleReturnRequest,rateOrder} = require("../controller/orderController")
const {verifyJWT} = require("../middleware/authMiddleware");
const {checkUserBlock} = require('../middleware/checkUserBlock')
const {getCategoryName,productTypes,productFilter} = require('../controller/filterController')
const { addToWishlist,removeFromWishlist,checkWishlist,getWishlist} = require('../controller/wishlistController')
const {displayCoupons,applyCoupen} = require('../controller/coupenController')
const {walletDetails} = require('../controller/walletController')
const {getoffer} = require('../controller/offerController')
const {getBestSellingProducts,categoriesForHome,categoryImage,getReviewsForHome,activeOffers,searchProducts} = require('../controller/homepageController')

userRoute.post("/signup",signup);
userRoute.post("/verifyOTP",verifyOTP)
userRoute.post("/resendOTP",resendOTP)
userRoute.get('/refresh-token', refreshAccessToken);
userRoute.post("/login",login);
userRoute.get("/getproductdata",verifyJWT,getProductData);
userRoute.get("/getactiveoffers",verifyJWT,getActiveOffers);
userRoute.get("/product-view/:id",verifyJWT,getSingleProductData);
userRoute.get("/getuserdata/:id",verifyJWT,getUserData);
userRoute.get("/profile/:id",verifyJWT,getProfiledata)
userRoute.put("/profileupdate/:id",verifyJWT,updateUserProfile)
userRoute.put("/change-password/:id",verifyJWT,changePassword)
userRoute.put("/profileImageupdate/:id",verifyJWT,profileImgUpdate)
userRoute.get("/related-products/:categoryId/:productId",verifyJWT,getRelatedProducts)
//address
userRoute.get("/addressdata/:id",verifyJWT,getAdressOfaUser)
userRoute.post("/addnewaddress/:id",verifyJWT,setNewAddressForUser)
userRoute.put("/updateaddress/:id",verifyJWT,updateAddress)
userRoute.delete("/deleteaddress/:id",verifyJWT,deleteAddress)
userRoute.post("/addaddresscheckoutpage/:id",verifyJWT,addAddressInCheckout)
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
userRoute.post('/add-wishlist', verifyJWT,checkUserBlock, addToWishlist);
userRoute.delete('/remove-wishlist/:productId', verifyJWT, removeFromWishlist);
userRoute.get('/check-wishlist/:productId',verifyJWT,checkUserBlock, checkWishlist);
userRoute.get('/wishlist', verifyJWT,checkUserBlock, getWishlist);
//return
userRoute.get('/getorderforreturn/:orderId',verifyJWT,getOrderForReturn)
userRoute.post('/handlereturn/:orderId/:productId',verifyJWT,handleReturnRequest)
//coupens
userRoute.get('/displaycoupons',verifyJWT,displayCoupons);
userRoute.get('/applycoupen',verifyJWT,applyCoupen);
//wallet
userRoute.get('/walletdetails',verifyJWT,walletDetails)
//offer
userRoute.get('/product-view-offer/:id',verifyJWT,getoffer)
//rating
userRoute.post('/addrating',verifyJWT,rateOrder)
//home
userRoute.get('/bestsellingproducts',verifyJWT,getBestSellingProducts)
userRoute.get('/categoriesforhome',verifyJWT,categoriesForHome)
userRoute.get('/categoryimage/:id', verifyJWT, categoryImage);
userRoute.get('/getreviewsforhome', verifyJWT, getReviewsForHome);
userRoute.get('/activeoffersforhome', verifyJWT, activeOffers);
//search
userRoute.get('/search',verifyJWT,searchProducts)

module.exports = userRoute