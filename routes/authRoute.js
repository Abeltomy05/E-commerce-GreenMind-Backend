const express = require("express");
const passport = require("passport");
const authRoute = express.Router();
const {verifyJWT} = require('../middleware/authMiddleware')
const { config } = require("../utils/config");
const { generateAccessToken, generateRefreshToken } = require("../utils/helper/jwt.helper");
const { setAuthCookie, clearAuthCookie } = require("../utils/helper/cookie.helper");

authRoute.get("/google/callback", 
  passport.authenticate("google", {
    failureRedirect: `${config.CLIENT_URL}/user/login`,
    session: false 
  }),
  async (req, res) => {
    try {
      if (!req.user) {
        throw new Error('Authentication failed');
      }

      const payload = {
        _id:req.user._id,
        email:req.user.email
      }
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      setAuthCookie(res,accessToken,refreshToken);
      
      console.log('Google auth successful, redirecting to home')
      res.redirect(`${config.CLIENT_URL}/user/home`);
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect(`${config.CLIENT_URL}/user/login`);
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
        clearAuthCookie(res);
        res.status(200).json({
          error: false,
          message: "Logged out successfully"
        });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(200).json({
        error: false,
        message: "Log out error"
      });
    }
  });

module.exports = authRoute