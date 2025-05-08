// const passport = require("passport");
// const { ExtractJwt } = require("passport-jwt");
// const { prisma } = require("../lib/prisma");

// function authenticate(req, res, next) {
//   passport.authenticate("jwt", { session: false }, async (err, user, info) => {
//     if (err) return next(err);
//     if (!user) return res.status(401).json({ message: "Non authentifié" });

//     // Vérifier si le token est révoqué
//     const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
//     const revoked = await prisma.revokedToken.findUnique({
//       where: { token },
//     });

//     if (revoked) {
//       return res.status(401).json({ message: "Token révoqué" });
//     }

//     req.user = user;
//     next();
//   })(req, res, next);
// }

// module.exports = authenticate;

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
        // 1. Gestion des erreurs de base
        if (err) return next(err);

        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        try {
          // 2. Vérifier si le token est révoqué
          const revoked = await prisma.revokedToken.findUnique({
            where: { token },
          });
          if (revoked)
            return res.status(401).json({ message: "Token révoqué" });

          // 3. Deux stratégies selon si le JWT est valide ou expiré
          if (user) {
            // Cas 1: Token encore valide
            const decoded = jwt.decode(token);
            const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

            // Rafraîchissement proactif si expiration imminente
            if (expiresIn < 300) {
              await handleTokenRefresh(user, res);
            }

            req.user = user;
            return next();
          } else if (info && info.name === "TokenExpiredError") {
            // Cas 2: Token expiré mais refresh possible
            return handleExpiredToken(req, res, next);
          }

          return res.status(401).json({ message: "Non authentifié" });
        } catch (error) {
          return next(error);
        }
      }
    )(req, res, next);
  };
}

// Gestion du rafraîchissement proactif
async function handleTokenRefresh(user, res) {
  const validUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { refreshToken: true },
  });

  if (validUser?.refreshToken) {
    const newAccessToken = generateAccessToken(user);

    const originalJson = res.json;
    res.json = function (data) {
      return originalJson.call(this, {
        ...data,
        tokenRefresh: {
          newAccessToken,
          expiresIn: 15 * 60,
        },
      });
    };
  }
}

// Gestion des tokens expirés
async function handleExpiredToken(req, res, next) {
  const refreshToken = req.headers["x-refresh-token"] || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Token expiré - Refresh token requis",
      code: "TOKEN_EXPIRED",
    });
  }

  try {
    // Vérification du refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
        refreshToken: refreshToken, // Vérifie qu'il correspond bien à celui en DB
      },
    });

    if (!user) throw new Error("Refresh token invalide");

    // Génération d'un nouveau token
    const newAccessToken = generateAccessToken(user);

    // Modification de la réponse
    const originalJson = res.json;
    res.json = function (data) {
      return originalJson.call(this, {
        ...data,
        tokenRefresh: {
          newAccessToken,
          expiresIn: 15 * 60,
        },
      });
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

module.exports = authenticate;
