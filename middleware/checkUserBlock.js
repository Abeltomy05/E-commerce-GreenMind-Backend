const User = require('../model/userModel')

const checkUserBlock = async (req, res, next) => {
    try {
        const userId = req.user?._id; 
        console.log("userId from check user is block",userId)    
        
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized access' });
        }

        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ 
                message: 'Your account has been blocked'
            });
        }

        next();
    } catch (error) {
        console.error('User block check error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports ={
    checkUserBlock
} 