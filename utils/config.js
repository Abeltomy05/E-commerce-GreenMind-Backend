import dotenv from "dotenv";
dotenv.config();

export const config = {
    AUTH_EMAIL: process.env.AUTH_EMAIL,
    AUTH_PASS: process.env.AUTH_PASS,
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
    ACCESS_TOKEN_SECRET_ADMIN: process.env.ACCESS_TOKEN_SECRET_ADMIN,
    REFRESH_TOKEN_SECRET_ADMIN: process.env.REFRESH_TOKEN_SECRET_ADMIN,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    CLIENT_URL: process.env.CLIENT_URL,
    SERVER_URL: process.env.SERVER_URL,

    CLOUDIANRY_NAME: process.env.CLOUDIANRY_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_PRESET_NAME: process.env.CLOUDINARY_PRESET_NAME,

    RZP_KEY_ID: process.env.RZP_KEY_ID,
    RZP_KEY_SECRET: process.env.RZP_KEY_SECRET,

    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_URI_ATLAS: process.env.MONGODB_URI_ATLAS,

    PORT: process.env.PORT,
    DOMAIN: process.env.DOMAIN,
    NODE_ENV: process.env.NODE_ENV
}