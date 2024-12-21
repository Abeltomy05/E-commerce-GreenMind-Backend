const jwt = require('jsonwebtoken'); 
const User = require('../model/userModel')

const verifyJWT = async(req, res, next) => {
  const token = req.cookies.accessToken;

  if (!token) return res.sendStatus(401);
try{
  const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const user = await User.findById(decoded?._id).select('-password -refreshToken');

  if(!user){
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.user = user;
  next();
}catch(error){
  return res.status(401).json({ message: error.message || 'Invalid access Token' });

}
  
};
  
  
module.exports = verifyJWT