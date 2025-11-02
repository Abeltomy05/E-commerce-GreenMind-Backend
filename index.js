const express = require("express")
const morgan  = require("morgan");
const dotenv = require('dotenv');
const cors = require("cors")
const cookieParser = require('cookie-parser'); 
const session = require("express-session");
const passport = require("passport");

const configurePassport = require("./config/passport");
const userRoute = require("./routes/userRoutes")
const adminRoute = require("./routes/adminRoutes");
const authRoute = require("./routes/authRoute")
const paymentRoute = require("./routes/paymentRoutes")
const User = require("./model/userModel");
const connectDB = require("./config/db");
const { config } = require("./utils/config");

dotenv.config();
const app = express();

connectDB();

app.use(morgan("dev")); 
app.use(cookieParser());
app.use(express.json())
app.use(express.urlencoded({ extended: true }));

configurePassport();

app.use(passport.initialize());

const corsOptions = {
    origin: "*", 
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    preflightContinue: true
  };
  
  app.use(cors(corsOptions));

   app.use("/user",userRoute)
   app.use("/admin",adminRoute)
   app.use("/auth",authRoute)
   app.use("/payment",paymentRoute)

   const PORT = config.PORT

   app.listen(PORT, "0.0.0.0", ()=>{
     console.log(`✅ Server is running on port: ${PORT}`);
   })