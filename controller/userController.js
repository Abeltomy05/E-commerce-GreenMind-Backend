const express =require("express")
const User = require("../model/userModel");
const Product = require("../model/productModel")
const Offer = require('../model/offerModel')
const UserOTPVerification = require("../model/userOTPverifivation")
const bcrypt = require('bcrypt');
require("dotenv").config();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const securePassword = async(password)=>{
    try{
       return await bcrypt.hash(password,10);
    }catch(error){
       console.log(error)
    }
}

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS
    },
});

const generateAccessToken = (user) => {
    return jwt.sign(
        { 
            _id: user._id, 
            email: user.email,
            firstname:user.firstname,
            username:user.username,
        }, 
        process.env.ACCESS_TOKEN_SECRET_USER, 
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { 
            _id: user._id, 
        }, 
        process.env.REFRESH_TOKEN_SECRET_USER, 
        { expiresIn: '7d' }
    );
};

const refreshAccessToken = async (req, res) => {
      const refreshToken = req.cookies.user_refresh_token;
  
      if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token' });
      }
  
      // Verify refresh token
      try{
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET_USER);
        const user = await User.findById(decoded?._id);

        if (!user) {
          return res.status(401).json({ message: 'User not found'  });
        }
        if(refreshToken !== user?.refreshToken){
          return res.status(401).json({ message: 'Invalid refresh token' });
        }
        const accessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user)

        await User.findByIdAndUpdate(user._id, { refreshToken: newRefreshToken });

        res.cookie('user_access_token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 1 * 60 * 1000 // 15 minutes
        });

        res.cookie('user_refresh_token', newRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.json({ 
          status: "VERIFIED",
          message: 'Token refreshed successfully',
          accessToken,
          refreshToken: newRefreshToken,
          user: {
            id: user._id,
            name: user.username,
            email: user.email,
            image: user.profileImage,
            phone: user.phone
          },
          role: "user"
      });

      }catch(error){
        console.error('Refresh Token Error:', error);

        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            status: "ERROR",
            message: 'Refresh token has expired' 
          });
        }
    
        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({ 
            status: "ERROR",
            message: 'Invalid refresh token' 
          });
        }
    
        return res.status(500).json({ 
          status: "ERROR",
          message: 'Internal server error during token refresh' 
        });
      }

  };


const signup = async(req,res)=>{
    try{
      const {firstname,lastname,username,password,email,phone} = req.body;
      console.log(req.body)
      const isEmailExists = await User.findOne({email})
      if(isEmailExists){
        res.status(409).json({message: "User already exists"});
      }else{
        const passwordHash = await securePassword(password);
       
        const user = await User.create({
            firstname,
            lastname,
            username,
            password:passwordHash,
            email,
            phone
        })
        await user.save()
        console.log("User created successfully")
        await sendOTPVerificationEmail({ id: user._id, email: user.email });
        
        res.status(201).json({
            message: "User registered successfully. OTP sent to email.",
            userId: user._id,
            email:email
           
        });
          }
    }catch(error){
        console.error("Signup error:", error.message);
        res.status(500).json({ message: error.message || "Something went wrong at signup" });
    }
}

const sendOTPVerificationEmail = async({id,email})=>{
     try{
        const otp = `${Math.floor(1000 + Math.random() * 9000)}`
         
        const mailOptions = {
            from: process.env.AUTH_EMAIL,
            to: email,
            subject: "Verify Your Email",
            text: `Your OTP is ${otp}`,
        };

        const hashedOTP = await bcrypt.hash(otp,10);
        const newOTPVerification =  new UserOTPVerification({
            userId: id,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + 30000,
        })
        await newOTPVerification.save();

        try {
            await transporter.sendMail(mailOptions);
          } catch (emailError) {
            console.error("Email Sending Error:", emailError.message);
            throw new Error(`Failed to send OTP. Reason: ${emailError.message}`);
          }

          console.log("OTP Verification email sent successfully");
        
     }catch(error){
        console.error("Error sending OTP:", error.message);
        throw new Error("Error sending OTP verification email.");
     }
}

const verifyOTP = async(req,res)=>{
    try{
      const{userId, otp} = req.body;
      console.log(req.body)
      if(!userId || !otp){
        throw Error("Empty otp details are not allowed");
      }else{
        const userOTPverifivationRecords = await UserOTPVerification.find({
            userId,
        });
        if(userOTPverifivationRecords.length <= 0){
             throw new Error("Account record dosen't exist or has been already verified. Please signup or login")
        }else{
            const {expiresAt} = userOTPverifivationRecords[0];
            const hashedOTP =  userOTPverifivationRecords[0].otp;

            if(expiresAt < Date.now()){
                await UserOTPVerification.deleteMany({userId});
                throw new Error("Code has expired. Please try again");
            }else{
                const validOTP = await bcrypt.compare(otp, hashedOTP); 
                if(!validOTP){
                    throw new Error("Invalid code passed. Check your inbox.")
                }else{
                   
                   const user = await User.findById(userId);
                   
                   
                   const accessToken = generateAccessToken(user);
                   const refreshToken = generateRefreshToken(user);

                   
                   await User.updateOne({_id: userId},{
                     verified: true,
                     refreshToken: refreshToken 
                   });
                   await UserOTPVerification.deleteMany({userId});

                   res.cookie('user_access_token', accessToken, {
                    httpOnly: false,  
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 15 * 60 * 1000,
                    domain: "abeltomy.site",
                    path: '/' 
                  });

                  res.cookie('user_refresh_token', refreshToken, {
                    httpOnly: false,  
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge:  7 * 24 * 60 * 60 * 1000,
                    domain: "abeltomy.site",
                    path: '/'
                  });
                  
                   res.json({
                    status: "VERIFIED",
                    user: {
                      id: user._id,
                      name: user.username,
                      email: user.email,
                      image: user.profileImage,
                      phone: user.phone
                    },
                    role: "user",
                    accessToken: accessToken,
                    refreshToken: refreshToken
                   })
                }
            }
        }
      }
    }catch(error){
        res.status(400).json({
            status: "FAILED",
            message: error.message,
        })
    }
}

const resendOTP = async(req,res)=>{
    try{
       const{userId, email} = req.body;

      
       if(!userId || !email){
        throw Error("Empty otp details are not allowed");
       }else{
         await UserOTPVerification.deleteMany({userId});
         await sendOTPVerificationEmail({id:userId,email:email});

         res.status(200).json({
            status: "SUCCESS",
            message: "New OTP sent successfully"
          });
       }
    }catch(error){
        res.json({
            status: "FAILED",
            message: error.message,
        })
    }
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    if (user.isAdmin) {
      return res.status(403).json({ message: "Invalid login attempt" });
    }
    if(user.isBlocked){
      return res.status(403).json({ message: "User is blocked" });
    }

    if (!user.verified && !user.isGoogleUser) {
      return res.status(403).json({ message: "Email not verified" });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.findByIdAndUpdate(user._id, { refreshToken });

    // console.log('Setting Cookies:', {
    //   accessToken: accessToken.substring(0, 20) + '...',
    //   refreshToken: refreshToken.substring(0, 20) + '...'
    // });

    res.cookie('user_access_token', accessToken, {
      httpOnly: false,  
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      domain: "abeltomy.site",
      path: '/' 
    });

    res.cookie('user_refresh_token', refreshToken, {
      httpOnly: false,  
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      domain: "abeltomy.site",
      path: '/'
    });

    return res.json({
      status: "VERIFIED",
      message: "User login success",
      user: {
        id: user._id,
        name: user.username,
        email: user.email,
        image: user.profileImage,
        phone: user.phone
      },
      role: "user",
      // accessToken: accessToken,
      // refreshToken: refreshToken
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

  const getProductData = async (req, res) => {
    try {
      const products = await Product.find({ isDeleted: false })
        .populate('category', 'name');
 
      return res.status(200).json(products);
    } catch (err) {
      console.error('Product Fetch Error:', err);
      return res.status(500).json({
        error: "Failed to fetch products",
        details: err.message
      });
    }
 };

 const getActiveOffers = async(req,res)=>{
  try {
    const currentDate = new Date();
    console.log('Current server date:', currentDate);

    const activeOffers = await Offer.find({
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate }
    }).populate({
      path: 'targetId',
      select: 'name _id',
      refPath: 'applicableTo'
    });

    console.log('Active offers found:', activeOffers.map(offer => ({
      id: offer._id,
      name: offer.name,
      startDate: offer.startDate,
      endDate: offer.endDate,
      target: offer.targetId?.name
    })));

    // const validOffers = activeOffers.filter(offer => offer.targetId != null);

    // console.log('Number of valid active offers found:', validOffers.length);
    // console.log('Valid offers:', validOffers.map(o => ({
    //   name: o.name,
    //   startDate: o.startDate,
    //   endDate: o.endDate
    // })));
    
    return res.status(200).json(activeOffers)

  } catch (err) {
    console.error('Active Offers Fetch Error:', err);
    return res.status(500).json({
      error: "Failed to fetch active offers",
      details: err.message
    });
  }
 }

const getSingleProductData = async(req,res)=>{
   try{
    const id = req.params.id;
    const product = await Product.findOne({ 
      _id: id,
      isDeleted: false 
    })
    .populate("category", "name")


    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let offerDetails = null;
    if (product.currentOffer) {
      const offer = await Offer.findById(product.currentOffer);
      
      if (offer) {
        const currentDate = new Date();
        const offerEndDate = new Date(offer.endDate);

        if (offerEndDate < currentDate) {
          await Product.updateOne(
            { _id: product._id },
            { $unset: { currentOffer: 1 } }
          );
        } else {
          offerDetails = {
            id: offer._id,
            name: offer.name,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
            maxDiscountAmount: offer.maxDiscountAmount,
            endDate: offer.endDate
          };
        }
      }
    }

    const formattedProduct = {
      _id: product._id,
      name: product.name,
      category: product.category,
      type: product.type,
      brand: product.brand,
      images: product.images,
      description: product.description,
      variants: product.variants.map(variant => {
        const basePrice = variant.price;
        let discountedPrice = basePrice;
        
        if (offerDetails) {
          if (offerDetails.discountType === 'PERCENTAGE') {
            const discount = (basePrice * offerDetails.discountValue) / 100;
            discountedPrice = basePrice - Math.min(discount, offerDetails.maxDiscountAmount || discount);
          } else if (offerDetails.discountType === 'FIXED') {
            discountedPrice = basePrice - offerDetails.discountValue;
          }
          discountedPrice = Math.round(discountedPrice * 100) / 100;
        }

        return {
          size: variant.size,
          price: basePrice,
          discountedPrice: discountedPrice !== basePrice ? discountedPrice : undefined,
          stock: variant.stock
        };
      }),
      currentOffer: offerDetails,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };


    res.json(formattedProduct);

   }catch (error) {
    console.error('Error fetching product:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID' });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }

}


const getUserData = async(req,res)=>{
    try{
      
      const id = req.params.id;
      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);

    }catch(error){
      console.error('Error fetching user in home:', error);
    }
}

const getRelatedProducts = async(req,res)=>{
  try {
  const { categoryId, productId } = req.params;

  const relatedProducts = await Product.find({
    category: categoryId,
    _id: { $ne: productId },
    isDeleted: false
  })
  .populate('category', 'name') 
  .populate('currentOffer') 
  .select('name images category variants currentOffer') 
  .limit(4); 

  if (!relatedProducts || relatedProducts.length === 0) {
    return res.status(404).json({ message: "No related products found" });
  }

  const processedProducts = relatedProducts.map(product => {
    const productObj = product.toObject();
    
    if (productObj.currentOffer) {
      const offer = productObj.currentOffer;
      const currentDate = new Date();
      
      if (currentDate >= offer.startDate && currentDate <= offer.endDate) {
        productObj.variants = productObj.variants.map(variant => {
          const originalPrice = variant.price;
          let discountAmount = 0;
          
          if (offer.discountType === 'PERCENTAGE') {
            discountAmount = (originalPrice * offer.discountValue) / 100;

            if (offer.maxDiscountAmount) {
              discountAmount = Math.min(discountAmount, offer.maxDiscountAmount);
            }
          } else if (offer.discountType === 'FIXED') {
            discountAmount = offer.discountValue;
          }
          
          return {
            ...variant,
            originalPrice: originalPrice,
            offerPrice: Math.max(originalPrice - discountAmount, 0), 
            discountAmount: discountAmount,
            discountPercentage: ((discountAmount / originalPrice) * 100).toFixed(1)
          };
        });
      }
    }
    
    return productObj;
  });

  res.status(200).json(processedProducts);
}catch (error) {
  console.error('Error in getRelatedProducts:', error);
  res.status(500).json({ message: "Internal server error", error: error.message });
}
}


const logout = async (req, res) => {
    try {

      await User.updateOne(
        { _id: req.user._id },
        { $unset: { refreshToken: 1 } }
      );
      
      res.clearCookie('user_access_token', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: 'abeltomy.site',
        path: '/'
      });
  
      res.clearCookie('user_refresh_token', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: 'abeltomy.site',
        path: '/'
      });
  
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Logout failed' });
    }
  };



module.exports = {
    signup,
    verifyOTP,
    resendOTP,
    refreshAccessToken,
    login,
    logout,
    getProductData,
    getSingleProductData,
    getUserData,
    getActiveOffers,
    getRelatedProducts
}