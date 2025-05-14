const jwt = require("jsonwebtoken");
const { ExtractJwt } = require("passport-jwt");
const { prisma } = require("../lib/prisma");

async function optionnalAuth(req, res, next) {
  const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req) || "";

  if (!token) {
    return next();
  }

  try {
    const revoked = await prisma.revokedToken.findUnique({
      where: { token },
    });
    if (revoked) return next();

    const decoded = jwt.decode(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      console.error("🔴 Utilisateur introuvable");
      return next();
    }
    req.user = user;
    return next();
  } catch (error) {
    console.error(
      "🔴 Erreur lors de la verification du token dans le middleware optionnalAuth:",
      error
    );
    return next();
  }
}

module.exports = optionnalAuth;
