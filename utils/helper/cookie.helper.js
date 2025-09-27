const { config } = require("../config")

const setAuthCookie = (res,accessToken,refreshToken)=>{
  res.cookie('access_token',accessToken,{
    httpOnly: config.NODE_ENV === 'production',
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: "/",
    domain: config.DOMAIN,
  })

  res.cookie('refresh_token',refreshToken,{
    httpOnly: config.NODE_ENV === 'production',
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    path: "/",
    domain: config.DOMAIN,
  })
}

const clearAuthCookie = (res)=>{
  res.clearCookie("access_token",{
    httpOnly: config.NODE_ENV === 'production',
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: "/",
    domain: config.DOMAIN,
  })

  res.clearCookie("refresh_token",{
    httpOnly: config.NODE_ENV === 'production',
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: "/",
    domain: config.DOMAIN,
  })
}

module.exports = {
    setAuthCookie,
    clearAuthCookie
}