const express =require("express")
const User = require("../model/userModel");
const bcrypt = require('bcrypt');
require("dotenv").config();
const jwt = require('jsonwebtoken');
const { verifyRefreshToken, generateAccessToken, generateRefreshToken } = require("../utils/helper/jwt.helper");
const { setAuthCookie, clearAuthCookie } = require("../utils/helper/cookie.helper");


const refreshToken = async (req, res) => {
    try {
      const refreshToken = req.cookies.refresh_token;
      console.log(refreshToken)
      
      if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token provided" });
      }
  
      const decoded = verifyRefreshToken(refreshToken);
        const user = await User.findById(decoded?._id);

      if (!user) {
        return res.status(401).json({ message: 'User not found'  });
      }

       const payload = {
          _id:user._id,
          email:user.email,
          isAdmin:user.isAdmin
        }
        const accessToken = generateAccessToken(payload);
        const newRefreshToken = generateRefreshToken(payload);

      setAuthCookie(res,accessToken,newRefreshToken);
       return res.json({ 
          status: "VERIFIED",
          message: 'Token refreshed successfully',
          user: {
            id: user._id,
            name: user.username,
            email: user.email,
          },
          role: "admin"
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
                
               const  payload = {
                  _id:adminInfo._id,
                  email:adminInfo.email,
                  isAdmin: adminInfo.isAdmin
                }
                const accessToken = generateAccessToken(payload);
                const refreshToken = generateRefreshToken(payload);
            
                 setAuthCookie(res,accessToken,refreshToken);
                  
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
   clearAuthCookie(res)

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