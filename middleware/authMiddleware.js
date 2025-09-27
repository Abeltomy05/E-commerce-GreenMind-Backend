const jwt = require('jsonwebtoken'); 
const User = require('../model/userModel');
const { verifyAccessToken } = require('../utils/helper/jwt.helper');

const verifyJWT = async(req, res, next) => {
  try{

  let token = req.cookies?.['access_token'];
  // console.log("token from cookie:", token);

  if (!token) {
    return res.status(401).json({ 
      status: 'error',
      message: 'Access denied. No token provided.' 
    });
  }

  const decoded = verifyAccessToken(token);
  const user = await User.findById(decoded?._id).select('-password -refreshToken').lean();

  if(!user){
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.user = {
    _id:user._id,
    email:user.email,
    username:user.username,
    isAdmin:user.isAdmin,
  };
  next();

}catch(error){
   if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    
    return res.status(401).json({ message: 'Authentication failed' });

}
  
};
  
const verifyAdmin = async (req, res, next) => {
  try {
    const accessToken = req.cookies?.['access_token'];

    if (!accessToken) {
      return res.status(401).json({ message: "No access token provided" });
    }

    
    const decoded = verifyAccessToken(token);
      // Check if user is admin
      const user = await User.findById(decoded.userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        isAdmin: true
      };

      next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: "Internal server error" });
  }
};

  
module.exports = {
  verifyJWT,
  verifyAdmin
}