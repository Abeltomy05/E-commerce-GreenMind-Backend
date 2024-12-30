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

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
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
  
  
module.exports = {
  verifyJWT
}