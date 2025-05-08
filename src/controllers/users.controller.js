const { prisma } = require("../lib/prisma");
const { hashValue, removeAccents, paginationQuery } = require("../utils");

const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const validRoles = ["AUTHOR", "ADMIN"];

const usersController = {
  // Ajouter un nouvel utilisateur
  createUser: async (req, res, next) => {
    const {
      email,
      name,
      password = process.env.DEFAULT_PASSWORD_USER,
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
      const { newUser } = await prisma.$transaction(async (tx) => {
        // Vérifier si l'utilisateur existe déjà
        const existingUser = await tx.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          throw new Error("Un compte avec cet email existe déjà");
        }

        // Hasher le mot de passe
        const hashedPassword = await hashValue(password);
        const searchableName = removeAccents(name);

        // Créer l'utilisateur
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            searchableName,
            role,
          },
        });

        return { newUser };
      });

      const userResponse = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      };

      // Renvoyer la réponse
      res.status(201).json({
        user: userResponse,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message:
          error.message ||
          "Erreur serveur lors de la création de l'utilisateur.",
      });
    }
  },

  // Lire tous les utilisateurs
  getAllUsers: async (req, res, next) => {
    const { page, limit } = req.query;

    try {
      const result = await paginationQuery(prisma.user, page, limit, {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
      });

      result.data.map((user) => {
        user.postsCount = user._count.posts;
        delete user._count;
        return user;
      });

      return res
        .status(200)
        .json({ message: "Liste des utilisateurs", ...result });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: "Erreur serveur.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Lire un utilisateur par ID
  getUserById: async (req, res, next) => {
    const { userId } = req.params;
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          _count: {
            select: {
              posts: true,
            },
          },
          posts: true,
        },
      });

      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé." });
      }

      user.postsCount = user._count.posts;
      delete user._count;

      return res.status(200).json({ user });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: "Erreur serveur.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Rechercher un utilisateur par email ou nom
  searchUser: async (req, res, next) => {
    const { q, page, limit } = req.query;
    if (!q || typeof q !== "string") {
      return res.status(400).json({
        message: "Veuillez fournir une requête de recherche.",
      });
    }

    const cleanedQuery = q.trim();
    if (cleanedQuery.length < 1) {
      return res.status(400).json({
        message: "La requête doit contenir au moins 1 caractère.",
      });
    }
    try {
      const result = await paginationQuery(prisma.user, page, limit, {
        where: {
          OR: [
            {
              searchableName: {
                contains: removeAccents(cleanedQuery),
                mode: "insensitive",
              },
            },
            { email: { contains: cleanedQuery, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      result.data.map((user) => {
        user.postsCount = user._count.posts;
        delete user._count;
        return user;
      });

      return res.status(200).json({
        message: "Résultats de la recherche",
        ...result,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: "Erreur lors de la recherche.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  // Modifier un utilisateur (email, name, password, role)
  updateUser: async (req, res, next) => {
    const { userId } = req.params;
    const { ...rest } = req.body;

    // Champs autorisés
    const allowedFields = ["email", "name", "password", "role"];
    const unknownFields = Object.keys(rest).filter(
      (key) => !allowedFields.includes(key)
    );

    if (unknownFields.length > 0) {
      return res.status(400).json({
        message: `Champs non autorisés: ${unknownFields.join(", ")}`,
      });
    }

    // Validation du type des valeurs
    const typeErrors = [];
    if (rest.name !== undefined && typeof rest.name !== "string") {
      typeErrors.push("Le nom doit être une chaîne de caractères");
    }
    if (rest.email !== undefined && typeof rest.email !== "string") {
      typeErrors.push("L'email doit être une chaîne de caractères");
    }
    if (rest.password !== undefined && typeof rest.password !== "string") {
      typeErrors.push("Le mot de passe doit être une chaîne de caractères");
    }

    if (typeErrors.length > 0) {
      return res.status(400).json({
        message: "Erreurs de validation",
        errors: typeErrors,
      });
    }

    const dataToUpdate = {};

    for (const key of allowedFields) {
      if (rest[key] !== undefined) {
        switch (key) {
          case "password":
            if (!passwordValid.test(rest[key])) {
              return res.status(400).json({
                message:
                  "Mot de passe invalide. 8+ caractères, majuscule, minuscule, chiffre, symbole.",
              });
            }
            dataToUpdate.password = await hashValue(rest[key]);
            break;

          case "role":
            if (!validRoles.includes(rest[key])) {
              return res.status(400).json({ message: "Rôle invalide." });
            }
            dataToUpdate.role = rest[key];
            break;

          case "name":
            // Validation supplémentaire pour le nom
            if (rest[key].trim().length === 0) {
              return res
                .status(400)
                .json({ message: "Le nom ne peut pas être vide." });
            }
            dataToUpdate.name = rest[key].trim();
            dataToUpdate.searchableName = removeAccents(rest[key].trim());
            break;

          default:
            dataToUpdate[key] = rest[key];
        }
      }
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({ message: "Aucun champ à mettre à jour." });
    }
    try {
      const { updatedUser } = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          throw new Error("Utilisateur non trouvé.");
        }

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: dataToUpdate,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            _count: {
              select: {
                posts: true,
              },
            },
            posts: true,
          },
        });

        updatedUser.postsCount = updatedUser._count.posts;
        delete updatedUser._count;

        return { updatedUser };
      });

      return res.status(200).json({
        message: "Utilisateur mis à jour avec succès.",
        user: updatedUser,
      });
    } catch (error) {
      next(error);
      if (error.code === "P2002" && error.meta?.target?.includes("email")) {
        return res.status(400).json({
          message: "Cet email est déjà utilisé par un autre utilisateur.",
        });
      }

      return res.status(500).json({
        message: "Erreur serveur lors de la mise à jour de l'utilisateur.",
      });
    }
  },

  // Supprimer un utilisateur
  deleteUser: async (req, res, next) => {
    const { userId } = req.params;
    try {
      const { deletedUser } = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser) {
          throw new Error("Utilisateur non trouvé.");
        }

        const deletedUser = await tx.prisma.delete({
          where: { id: userId },
          select: {
            name: true,
            role: true,
          },
        });

        return { deletedUser };
      });

      return res.status(200).json({
        message: `L'utilisateur ${deletedUser.name}-${deletedUser.role} a été supprimé.`,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: "Erreur serveur.",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = {
  usersController,
};
