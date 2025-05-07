const passport = require("passport");
const { Strategy, ExtractJwt } = require("passport-jwt");
const { prisma } = require("../../lib/prisma");

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new Strategy(opts, async (jwt_payload, done) => {
    try {
      const user = prisma.user.findUnique({
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
