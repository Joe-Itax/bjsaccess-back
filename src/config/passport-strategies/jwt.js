const passport = require("passport");
const { Strategy, ExtractJwt } = require("passport-jwt");
const { prisma } = require("../../lib/prisma");
const jwt = require("jsonwebtoken");

// Options pour le access token
const accessTokenOpts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_ACCESS_SECRET,
};

// Options pour le refresh token
const refreshTokenOpts = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req) => req.cookies?.refreshToken,
  ]),
  secretOrKey: process.env.JWT_REFRESH_SECRET,
};

passport.use(
  new Strategy(accessTokenOpts, async (jwt_payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: {
          email: jwt_payload.email,
        },
      });
      if (user) return done(null, user);
      return done(null, false);
    } catch (error) {
      done(error);
    }
  })
);
