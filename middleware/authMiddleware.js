const jwt = require('jsonwebtoken'); 
const User = require('../model/userModel')

const verifyJWT = async(req, res, next) => {
  try{

  let token = req.cookies.accessToken;

  if (!token) {
    token = req.headers.authorization?.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ 
      status: 'error',
      message: 'Access denied. No token provided.' 
    });
  }

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET_USER);
  const user = await User.findById(decoded?._id).select('-password -refreshToken').lean();

  if(!user){
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // if (user.isBlocked) {
  //   return res.status(403).json({ 
  //     status: 'error',
  //     message: 'Your account has been suspended.' 
  //   });
  // }

  // console.log("successfully verified token  ")
  req.user = user;
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
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({ message: "No access token provided" });
    }

    jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET_ADMIN, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

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
    });
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: "Internal server error" });
  }
};

  
module.exports = {
  verifyJWT,
  verifyAdmin
}