const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth2").Strategy;
const User = require("../model/userModel"); 
const { config } = require("../utils/config");

const configurePassport = () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: `${config.SERVER_URL}/auth/google/callback`,
        scope: ["profile", "email"],
        passReqToCallback: true,
      },
      async (request, accessToken, refreshToken, profile, done) => {
        try {
          console.log(profile);
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            user = new User({
              firstname: profile.name.givenName,
              lastname: profile.name.familyName,
              username: profile.displayName,
              email: profile.emails[0].value,
              googleId: profile.id,
              isGoogleUser: true,
              verified: true,
              profileImage:
                profile.photos && profile.photos.length > 0
                  ? profile.photos[0].value
                  : "default_profile_image_url",
            });

            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

};

module.exports = configurePassport;