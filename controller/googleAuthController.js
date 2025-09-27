const { config } = require("../utils/config");
const { clearAuthCookie, setAuthCookie } = require("../utils/helper/cookie.helper");
const { generateAccessToken, generateRefreshToken } = require("../utils/helper/jwt.helper");

const googleCallback = async (req, res) => {
  try {
    if (!req.user) {
      throw new Error("Authentication failed");
    }

    const payload = {
      _id: req.user._id,
      email: req.user.email,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    setAuthCookie(res, accessToken, refreshToken);

    console.log("Google auth successful, redirecting to home");
    res.redirect(`${config.CLIENT_URL}/user/home`);
  } catch (error) {
    console.error("Google callback error:", error);
    res.redirect(`${config.CLIENT_URL}/user/login`);
  }
};

const loginSuccess = async (req, res) => {
  try {
    if (req.user) {
      res.status(200).json({
        success: true,
        message: "Successfully Logged In",
        user: {
          id: req.user._id,
          username: req.user.username,
          email: req.user.email,
        },
        role: "user",
      });
    } else {
      res.status(401).json({
        error: true,
        message: "Not Authorized",
      });
    }
  } catch (error) {
    console.error("Login success error:", error);
    res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};

const loginFailed = (req, res) => {
  res.status(401).json({
    error: true,
    message: "Log in failure",
  });
};

const logout = async (req, res) => {
  try {
    clearAuthCookie(res);
    res.status(200).json({
      error: false,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(200).json({
      error: false,
      message: "Log out error",
    });
  }
};

module.exports = {
  googleCallback,
  loginSuccess,
  loginFailed,
  logout,
};