const jwt = require('jsonwebtoken'); 
const User = require('../model/userModel')

const verifyJWT = async(req, res, next) => {
  try{

  const token = req.cookies.accessToken || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const user = await User.findById(decoded?._id).select('-password -refreshToken').lean();

  if(!user){
    return res.status(401).json({ message: 'Unauthorized' });
  }
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