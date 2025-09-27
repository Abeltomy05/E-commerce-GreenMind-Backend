const jwt = require('jsonwebtoken');
const { config } = require('../config');

const generateAccessToken = (payload)=>{
   const accessToken = jwt.sign(payload,config.ACCESS_TOKEN_SECRET,{
     expiresIn: "15m",
   });
   return accessToken;
}

const generateRefreshToken = (payload)=>{
   const refreshToken = jwt.sign(payload,config.REFRESH_TOKEN_SECRET,{
     expiresIn: "7d",
   });
   return refreshToken;
}

const verifyAccessToken = (token)=>{
    const payload = jwt.verify(token,config.ACCESS_TOKEN_SECRET);
    return payload;
}

const verifyRefreshToken = (token)=>{
    const payload = jwt.verify(token,config.REFRESH_TOKEN_SECRET);
    return payload;
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
}