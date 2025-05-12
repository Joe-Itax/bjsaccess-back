const passport = require("passport");
const { ExtractJwt } = require("passport-jwt");
const { prisma } = require("../lib/prisma");
const jwt = require("jsonwebtoken");
const { generateAccessToken } = require("../controllers/index.controller");

function authenticate() {
  return (req, res, next) => {
    passport.authenticate(
      "jwt",
      { session: false },
      async (err, user, info) => {
        if (err) return next(err);

        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req) || "";

        try {
          if (!token) {
            return res.status(404).json({ message: "Token non fourni." });
          }
          const revoked = await prisma.revokedToken.findUnique({
            where: { token },
          });
          if (revoked)
            return res.status(401).json({ message: "Token révoqué" });

          if (user) {
            const decoded = jwt.decode(token);
            const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

            if (expiresIn < 300) {
              await attachTokenRefresh(user, res);
            }

            req.user = user;
            return next();
          } else if (info && info.name === "TokenExpiredError") {
            return tryAttachExpiredToken(req, res, next);
          }

          return res.status(401).json({ message: "Non authentifié" });
        } catch (error) {
          return next(error);
        }
      }
    )(req, res, next);
  };
}

async function attachTokenRefresh(user, res) {
  const validUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { refreshToken: true },
  });

  if (validUser?.refreshToken) {
    const newAccessToken = generateAccessToken(user);
    res.locals.tokenRefresh = {
      newAccessToken,
      expiresIn: 15 * 60,
    };
  }
}

async function tryAttachExpiredToken(req, res, next) {
  const refreshToken =
    req.headers["x-refresh-token"] || req.body?.refreshToken || "";

  if (!refreshToken) {
    return res.status(401).json({
      message: "Token expiré - Refresh token requis",
      code: "TOKEN_EXPIRED",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id, refreshToken: refreshToken },
    });

    if (!user) throw new Error("Refresh token invalide");

    const newAccessToken = generateAccessToken(user);
    res.locals.tokenRefresh = {
      newAccessToken,
      expiresIn: 15 * 60,
    };

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Session expirée - Reconnectez-vous",
      code: "SESSION_EXPIRED",
    });
  }
}

function attachTokenRefreshToResponse(req, res, next) {
  const originalJson = res.json;
  res.json = function (data) {
    if (res.locals.tokenRefresh) {
      data.tokenRefresh = res.locals.tokenRefresh;
    }
    return originalJson.call(this, data);
  };
  next();
}

module.exports = {
  authenticate,
  attachTokenRefreshToResponse,
};
