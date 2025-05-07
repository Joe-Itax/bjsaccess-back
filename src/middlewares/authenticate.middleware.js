const passport = require("passport");
const { ExtractJwt } = require("passport-jwt");
const { prisma } = require("../lib/prisma");

function authenticate(req, res, next) {
  passport.authenticate("jwt", { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: "Non authentifié" });

    // Vérifier si le token est révoqué
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const revoked = await prisma.revokedToken.findUnique({
      where: { token },
    });

    if (revoked) {
      return res.status(401).json({ message: "Token révoqué" });
    }

    req.user = user;
    next();
  })(req, res, next);
}

module.exports = authenticate;
