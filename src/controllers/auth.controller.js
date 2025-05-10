const jwt = require("jsonwebtoken");
const { ExtractJwt } = require("passport-jwt");
const { prisma } = require("../lib/prisma");
const { compareHash } = require("../utils");

const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const authController = {
  // Login avec email et mot de passe
  login: async (req, res, next) => {
    const { email, password, ...extraFields } = req.body;
    // Validation des champs
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: "Seuls 'email' & 'password' sont autorisés.",
      });
    }

    // Validation des valeurs
    if (!email || !password) {
      return res.status(400).json({
        message:
          "Tous les champs obligatoires (email & password) doivent être fournis.",
      });
    }

    // Validation des types
    const validationErrors = [];
    if (typeof email !== "string") validationErrors.push("Email invalide");
    if (typeof password !== "string")
      validationErrors.push("Mot de passe invalide");

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Erreurs de validation",
        errors: validationErrors,
      });
    }

    if (!emailValid.test(email)) {
      return res.status(400).json({ message: "Email invalide." });
    }

    try {
      const oldToken = req.headers.authorization?.split(" ")[1];
      if (oldToken) {
        const decoded = jwt.decode(oldToken);
        if (decoded?.exp && decoded?.id) {
          await prisma.revokedToken.upsert({
            where: { token: oldToken },
            update: {},
            create: {
              token: oldToken,
              expiresAt: new Date(decoded.exp * 1000),
              userId: decoded.id,
            },
          });
        }
      }

      const { user, refreshToken, accessToken } = await prisma.$transaction(
        async (tx) => {
          // 1. Vérification de l'existence de l'utilisateur
          const user = await tx.user.findUnique({ where: { email } });
          if (!user) throw new Error("Aucun compte associé à cet email");

          // 2. Vérification du mot de passe
          const passwordMatch = await compareHash(password, user.password);
          if (!passwordMatch) throw new Error("Mot de passe incorrect");

          // 3. Génération des tokens
          const accessToken = generateAccessToken(user);
          const refreshToken = generateRefreshToken(user);

          // 4. Mise à jour du refresh token en base
          await tx.user.update({
            where: { id: user.id },
            data: { refreshToken },
          });

          return { user, accessToken, refreshToken };
        }
      );

      // Formatage de la réponse
      const userResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Renvoyer les tokens
      res.json({
        accessToken,
        refreshToken,
        user: userResponse,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur lors de la connexion.",
      });
    }
  },

  // Rafraîchir le token d'accès
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken, ...extraFields } = req.body;

      if (Object.keys(extraFields).length > 0) {
        return res.status(400).json({
          message: "Seul 'refreshToken' est autorisé.",
        });
      }

      if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token requis" });
      }

      if (typeof refreshToken !== "string") {
        return res.status(400).json({
          message: "Le refresh token doit être une chaîne de caractères.",
        });
      }

      // Vérifier le refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      // Trouver l'utilisateur avec ce refresh token
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });

      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: "Refresh token invalide" });
      }

      // Générer un nouveau access token
      const newAccessToken = generateAccessToken(user);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.message === "Refresh token invalide"
      ) {
        return res.status(403).json({ message: "Token invalide ou expiré" });
      }
      next(error);
    }
  },

  // Déconnexion
  logout: async (req, res, next) => {
    try {
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

      await prisma.$transaction(async (tx) => {
        // 1. Vérifier l'utilisateur
        const user = await tx.user.findUnique({
          where: { id: req.user.id },
        });
        if (!user) throw new Error("Utilisateur non trouvé");

        // 2. Ajouter le token à la liste des révoqués
        const decoded = jwt.decode(token);
        await tx.revokedToken.create({
          data: {
            token,
            expiresAt: new Date(decoded.exp * 1000),
            userId: req.user.id,
          },
        });

        // 3. Supprimer le refresh token
        await tx.user.update({
          where: { id: req.user.id },
          data: { refreshToken: null },
        });
      });

      res.json({ message: "Déconnexion réussie" });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur lors de la deconnexion.",
      });
    }
  },

  // Vérifier l'état de l'utilisateur
  checkAuth: async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileImage: true,
        },
      });

      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      res.json({ user });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message:
          "Erreur serveur lors de la vérification de l'état de l'utilisateur.",
      });
    }
  },
};

// Fonctions utilitaires pour générer les tokens
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

module.exports = {
  authController,
  generateAccessToken,
};
