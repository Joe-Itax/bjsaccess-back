const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const { compareHash, hashValue } = require("../utils");
const { ExtractJwt } = require("passport-jwt");

const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const validRoles = ["AUTHOR", "ADMIN"];

const authController = {
  // Création de compte
  signup: async (req, res, next) => {
    const {
      email,
      password = process.env.DEFAULT_PASSWORD_USER,
      name,
      role = "AUTHOR",
      ...extraFields
    } = req.body;

    // Validation des champs
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: "Seuls 'email', 'password', 'name' & 'role' sont autorisés.",
      });
    }

    // Validation des valeurs
    if (!email || !name) {
      return res.status(400).json({
        message:
          "Tous les champs obligatoires (email & name) doivent être fournis.",
      });
    }

    // Validation des types
    const validationErrors = [];
    if (typeof name !== "string") validationErrors.push("Nom invalide");
    if (typeof email !== "string") validationErrors.push("Email invalide");
    if (typeof password !== "string")
      validationErrors.push("Mot de passe invalide");
    if (typeof role !== "string") validationErrors.push("Rôle invalide");

    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Erreurs de validation",
        errors: validationErrors,
      });
    }

    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Rôle invalide." });
    }

    if (!emailValid.test(email)) {
      return res.status(400).json({ message: "Email invalide." });
    }

    if (!passwordValid.test(password)) {
      return res.status(400).json({
        message:
          "Mot de passe invalide. 8+ caractères, majuscule, minuscule, chiffre, symbole.",
      });
    }

    try {
      const user = await prisma.$transaction(async (tx) => {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await tx.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          throw new Error("Un compte avec cet email existe déjà");
        }

        // Hasher le mot de passe
        const hashedPassword = await hashValue(password);

        // Créer l'utilisateur
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
          },
        });

        // Générer les tokens
        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);

        // Mettre à jour l'utilisateur avec le refresh token
        await tx.user.update({
          where: { id: newUser.id },
          data: { refreshToken },
        });

        return { newUser, refreshToken, accessToken };
      });

      const userResponse = {
        id: user.newUser.id,
        email: user.newUser.email,
        name: user.newUser.name,
        role: user.newUser.role,
        profileImage: user.newUser.profileImage,
        bio: user.newUser.bio,
        createdAt: user.newUser.createdAt,
        updatedAt: user.newUser.updatedAt,
      };

      // Renvoyer la réponse
      res.status(201).json({
        accessToken: user.accessToken,
        refreshToken: user.refreshToken,
        user: userResponse,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur lors de la création.",
      });
    }
  },

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

module.exports = authController;
