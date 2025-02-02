const express =require("express")
const User = require("../model/userModel");
const bcrypt = require('bcrypt');
require("dotenv").config();
const jwt = require('jsonwebtoken');



const generateAccessToken = (user) => {
    return jwt.sign(
        { 
            userId: user._id, 
            email: user.email 
        }, 
        process.env.ACCESS_TOKEN_SECRET_ADMIN, 
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { 
            userId: user._id, 
            email: user.email 
        }, 
        process.env.REFRESH_TOKEN_SECRET_ADMIN, 
        { expiresIn: '7d' }
    );
};

const refreshToken = async (req, res) => {
    try {
      const refreshToken = req.cookies.admin_refresh_token;
      
      if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token provided" });
      }
  
      jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET_ADMIN, async (err, decoded) => {
        if (err) {
          return res.status(403).json({ message: "Invalid refresh token" });
        }

        const user = await User.findOne({ 
          _id: decoded.userId,
          refreshToken: refreshToken 
        });
  
        if (!user) {
          return res.status(401).json({ message: "User not found or token invalid" });
        }
  
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        await User.updateOne(
          { _id: user._id },
          { refreshToken: newRefreshToken }
        );

        res.cookie('admin_access_token', newAccessToken, {
          httpOnly: false,  
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 15 * 60 * 1000,
          domain: "abeltomy.site",
          path: '/' 
        });
  
        res.cookie('admin_refresh_token', newRefreshToken, {
          httpOnly: false,  
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          domain: "abeltomy.site",
          path: '/' 
        });
  
        res.json({ message: "Tokens refreshed successfully" });
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

const adminLogin =async (req,res)=>{
    try{
        const {email,password} =req.body
        const adminInfo =await User.findOne({email})

        if(adminInfo?.isAdmin){
            if(await bcrypt.compare( password,adminInfo.password)){
                
                const accessToken = generateAccessToken(adminInfo);
                const refreshToken = generateRefreshToken(adminInfo);
              
                await User.updateOne({_id: adminInfo._id},{
                    refreshToken: refreshToken 
                  });

                  res.cookie('admin_access_token', accessToken, {
                    httpOnly: false,  
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 15 * 60 * 1000,
                    domain: "abeltomy.site",
                    path: '/'
                  });
    
                  res.cookie('admin_refresh_token', refreshToken, {
                    httpOnly: false,  
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                    domain: "abeltomy.site",
                    path: '/'
                  });
                  
                   res.json({
                    status: "VERIFIED",
                    message: "Admin login success",
                    user:{
                        id:adminInfo._id,
                        name:adminInfo.username,
                        email:adminInfo.email,
                        image:adminInfo.profileImage,
                        phone:adminInfo.phone
                      },
                      role:"admin"
                   })   
               
            }else{
                res.json("invalid password")
                console.log("admin password is wrong");   
            }
        }else{
            res.status(401).json({message:"No access"})
        }
    }catch(err){
       console.log(err);    
    }
}

const getUserData = async(req,res)=>{
    try{
        const users = await User.find({ isAdmin: false });
        res.json(users)
    }catch(err){
        console.log(err);
        res.status(500).json({ error: "Failed to fetch users" });
    }
}

const deleteUser = async (req, res) => {
    try {
      const { id } = req.params;
      const deletedUser = await User.findByIdAndDelete(id);
  
      if (!deletedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

const editUser = async(req,res)=>{
    try{
        const {firstName,lastName,username,email,phone,isBlocked} = req.body
        const { id } = req.params;
        
        let updatedData ={}
        const user = await User.findOne({ _id: id });
        if(!user){
            return res.status(404).json({message: "User not found" })
        }
        if(firstName){
            updatedData.firstname = firstName;
        }
        if(lastName){
            updatedData.lastname = lastName;
        }
        if(username){
            updatedData.username = username;
        }
        if(email){
            updatedData.email = email;
        }
        if(phone){
            updatedData.phone=phone;
        }
        // if(image){
        //     updatedData.profileImage = image;
        // }
        if(isBlocked){
            updatedData.isBlocked = true;
        }
        const updatedUser = await User.findByIdAndUpdate(id,updatedData)
        res.json({message:"Updation succes", updatedUser})

    }catch(err){
        console.log(err);   
    }
}
const isBlock = async(req,res)=>{
    try{
        const userId = req.params.id;
        const { isBlocked } = req.body;
           
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { isBlocked }, 
            { new: true }
          );
        res.status(200).json(updatedUser);  

    }catch(error){
        res.status(500).json({ message: "Error updating user status" });
    }
}


const logoutAdmin = async (req, res) => {
  try {
    await User.updateOne(
      { refreshToken: { $exists: true } }, 
      { $unset: { refreshToken: "" } }
    );

    res.clearCookie('admin_access_token', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: 'abeltomy.site',
      path: '/' 
    });

    res.clearCookie('admin_refresh_token', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: 'abeltomy.site',
      path: '/' 
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Error during logout' });
  }
};

module.exports = {
    adminLogin,
    getUserData,
    deleteUser,
    editUser,
    isBlock,
    refreshToken,
    logoutAdmin
}