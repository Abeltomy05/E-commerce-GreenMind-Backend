const express = require("express");
const passport = require("passport");
const {verifyJWT} = require('../middleware/authMiddleware');
const { googleCallback, loginSuccess, loginFailed, logout } = require("../controller/googleAuthController");
const authRoute = express.Router();

// Google OAuth
authRoute.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

authRoute.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/login/failed",
    session: false,
  }),
  googleCallback
);

// Login status
authRoute.get("/login/success", verifyJWT, loginSuccess);
authRoute.get("/login/failed", loginFailed);


// Logout
authRoute.post("/logout", verifyJWT, logout);


module.exports = authRoute