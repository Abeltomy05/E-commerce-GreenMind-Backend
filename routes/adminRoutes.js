const express = require("express")
const adminRoute = express.Router()
const {adminLogin,getUserData,deleteUser,editUser,isBlock,refreshToken,logoutAdmin} = require("../controller/adminController")
const {getProductData,addProduct,softDeleteProduct,editProduct} = require("../controller/productController")
const {cloudinaryImgUpload} = require("../controller/cloudinaryController")
const {userCount} = require("../controller/dashboardController")
const {categoryData,addCategoryData,categoryStatus,categoryEdit,categoryDataForAddProduct} = require('../controller/categoryController')
const authMiddleware = require("../middleware/authMiddleware")
const {getOrderDataAdmin,getOrderDetailsAdmin,changeOrderStatus,cancelOrderAdmin,getReturnRequests,approveReturnRequest} = require('../controller/orderController')
const {coupenData,createcoupon,deletecoupon} = require('../controller/coupenController')
const {getOrders,getCategorySalesData,getTopItems } = require('../controller/adminDashboard')
const {getOffers,createOffer,getProducts,getCategories,deleteOffer} = require('../controller/offerController')
const {verifyAdmin} = require('../middleware/authMiddleware')

adminRoute.post('/login',adminLogin);
adminRoute.post('/refresh-token',refreshToken);


adminRoute.get('/data',verifyAdmin,getUserData);
adminRoute.delete('/delete/:id',verifyAdmin,deleteUser);
adminRoute.put('/edit/:id',verifyAdmin,editUser);
adminRoute.put('/block/:id',verifyAdmin,isBlock);
adminRoute.get('/productdata',verifyAdmin,getProductData);
adminRoute.post('/addproduct',verifyAdmin,addProduct);
adminRoute.put('/editproduct/:id',verifyAdmin,editProduct);
adminRoute.get('/generate-upload-url',cloudinaryImgUpload);
adminRoute.put('/softdeleteproduct/:id',verifyAdmin,softDeleteProduct);
adminRoute.get('/user-count',verifyAdmin,userCount);
adminRoute.get('/categorydata',verifyAdmin,categoryData);
adminRoute.post('/addcategorydata',verifyAdmin,addCategoryData);
adminRoute.put('/categorystatus/:id',verifyAdmin,categoryStatus);
adminRoute.put('/editcategory/:id',verifyAdmin,categoryEdit);
adminRoute.get('/categorydata-addproduct',verifyAdmin,categoryDataForAddProduct);
//order
adminRoute.get('/getorderdata',verifyAdmin,getOrderDataAdmin)
adminRoute.get('/getorderdetails/:orderId',verifyAdmin,getOrderDetailsAdmin)
adminRoute.patch('/changeorderstatus/:id',verifyAdmin,changeOrderStatus)
adminRoute.patch('/cancelorder/:id',verifyAdmin,cancelOrderAdmin)
//return
adminRoute.get('/getreturnrequests',verifyAdmin,getReturnRequests);
adminRoute.post('/approvereturn',verifyAdmin,approveReturnRequest);
//coupen
adminRoute.get('/getcoupons',verifyAdmin,coupenData);
adminRoute.post('/createcoupon',verifyAdmin,createcoupon);
adminRoute.delete('/deletecoupon/:id',verifyAdmin,deletecoupon);
//dashboard
adminRoute.get('/getorders',verifyAdmin,getOrders)
adminRoute.get('/category-sales',verifyAdmin,getCategorySalesData)
adminRoute.get('/bestsellingitems',verifyAdmin,getTopItems)
//offers
adminRoute.get('/getoffers',verifyAdmin,getOffers)
adminRoute.post('/createoffer',verifyAdmin,createOffer)
adminRoute.delete('/deleteoffer/:id',verifyAdmin,deleteOffer)
adminRoute.get('/products',verifyAdmin,getProducts )
adminRoute.get('/categories',verifyAdmin,getCategories  )
//logout
adminRoute.post('/logout',verifyAdmin,logoutAdmin)
module.exports = adminRoute;