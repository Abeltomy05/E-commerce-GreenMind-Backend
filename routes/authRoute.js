const express = require("express");
const passport = require("passport");
const authRoute = express.Router();
const User = require('../model/userModel')
const {verifyJWT} = require('../middleware/authMiddleware')
const jwt = require('jsonwebtoken');


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

// const protect = (req, res, next) => {
//   if (req.isAuthenticated()) {
//     return next();
//   }
//   res.status(401).json({
//     error: true,
//     message: "Not authorized, please login"
//   });
// };

authRoute.get("/google/callback", 
  passport.authenticate("google", {
    failureRedirect: "https://abeltomy.site/user/login",
    session: true 
  }),
  async (req, res) => {
    try {
      if (!req.user) {
        throw new Error('Authentication failed');
      }
      const accessToken = generateAccessToken(req.user);
      const refreshToken = generateRefreshToken(req.user);

      await User.findByIdAndUpdate(req.user._id, { refreshToken });

      res.cookie('user_access_token', accessToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: 'abeltomy.site',
        maxAge: 15 * 60 * 1000,
        path: '/'
      });

      res.cookie('user_refresh_token', refreshToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        domain: 'abeltomy.site',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });
      console.log('Google auth successful, redirecting to home')
      res.redirect("https://abeltomy.site/user/home");
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("https://abeltomy.site/user/login");
    }
  }
);

  authRoute.get("/google", 
    passport.authenticate("google", { 
      scope: ["profile", "email"] 
    })
  );

authRoute.get("/login/failed",(req,res)=>{
    res.status(401).json({
        error:true,
        message:"Log in failure"
        
    })
})

authRoute.get("/login/success", verifyJWT, async (req, res) => {
  try {
    if (req.user) {
      res.status(200).json({
        error: false,
        message: "Successfully Logged In",
        user: {
          id: req.user._id,
          firstname: req.user.firstname,
          lastname: req.user.lastname,
          email: req.user.email,
          isGoogleUser: req.user.isGoogleUser,
        },
        role: 'user'
      });
    } else {
      res.status(403).json({
        error: true, 
        message: "Not Authorized"
      });
    }
  } catch (error) {
    console.error("Login success error:", error);
    res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
});


  
  authRoute.post("/logout",verifyJWT, async(req, res) => {
    try {
      const token = req.cookies.user_refresh_token;
      if (token) {
        await User.updateOne(
          { refreshToken: token },
          { $set: { refreshToken: null } }
        );
      }

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

      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error('Session destruction error:', err);
          }
        });
      }

        res.status(200).json({
          error: false,
          message: "Logged out successfully"
        });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(200).json({
        error: false,
        message: "Logged out successfully"
      });
    }
  });

module.exports = authRoute