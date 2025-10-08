const mongoose = require("mongoose");
const { config } = require("../utils/config");


const connectDB = async()=>{
    try {
        const conn = await mongoose.connect(config.MONGODB_URI_ATLAS);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        console.error("❌ MongoDB connection error:", err.message);
        process.exit(1);
    }
}

module.exports = connectDB;