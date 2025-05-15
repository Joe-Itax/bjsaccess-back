const { prisma } = require("../lib/prisma");
const { hashValue, removeAccents, paginationQuery } = require("../utils");

const emailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const validRoles = ["AUTHOR", "ADMIN"];
const protectedAccounts = process.env.PROTECTED_ACCOUNTS.split(",");
const baseUrlPostFeaturedImage = process.env.BASE_URL || "";

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
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      };

      // Renvoyer la réponse
      res.status(201).json({
        user: userResponse,
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message:
      //     error.message ||
      //     "Erreur serveur lors de la création de l'utilisateur.",
      // });
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
          isActive: true,
          _count: {
            select: {
              posts: true,
            },
          },
          createdAt: true,
          updatedAt: true,
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
      // return res.status(500).json({
      //   message: "Erreur serveur.",
      //   details:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
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
          isActive: true,
          _count: {
            select: {
              posts: true,
            },
          },
          posts: {
            select: {
              id: true,
              title: true,
              slug: true,
              content: true,
              published: true,
              featuredImage: true,
              createdAt: true,
              updatedAt: true,
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              tags: {
                select: {
                  tag: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé." });
      }

      const formattedPosts = user.posts.map((post) => ({
        ...post,
        featuredImage: baseUrlPostFeaturedImage + post.featuredImage,
        tags: post.tags.map((tagObj) => tagObj.tag),
        author: {
          id: user.id,
          name: user.name,
          profileImage: user.profileImage,
        },
      }));

      user.postsCount = user._count.posts;
      delete user._count;

      return res.status(200).json({
        user: {
          ...user,
          postsCount: user.postsCount,
          posts: formattedPosts,
        },
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: "Erreur serveur.",
      //   details:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },

  // Rechercher un utilisateur par email ou nom
  searchUser: async (req, res, next) => {
    const { q, page, limit } = req.query;
    console.log("query: ", q);
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
          isActive: true,
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
      // return res.status(500).json({
      //   message: "Erreur lors de la recherche.",
      //   details:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },

  // Modifier un utilisateur (email, name, password, role)
  updateUser: async (req, res, next) => {
    const { userId } = req.params;
    const { ...rest } = req.body;

    // Champs autorisés
    const allowedFields = ["email", "name", "password", "role", "isActive"];
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
    if (
      (rest.name !== undefined && typeof rest.name !== "string") ||
      (rest.name !== undefined && !rest.name.trim().length >= 2)
    ) {
      typeErrors.push(
        "Le nom doit être une chaîne de caractères de minimum 2 caractères"
      );
    }
    if (rest.email !== undefined && typeof rest.email !== "string") {
      typeErrors.push("L'email doit être une chaîne de caractères");
    }
    if (rest.password !== undefined && typeof rest.password !== "string") {
      typeErrors.push("Le mot de passe doit être une chaîne de caractères");
    }
    if (rest.isActive !== undefined && typeof rest.isActive !== "boolean") {
      typeErrors.push("isActive doit être un booléen");
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

    // Vérifie si l'utilisateur connecté est autorisé à modifier cette cible
    const isSelf = req.user.id === userId;
    const isAdmin = req.user.role === "ADMIN";

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        message:
          "Accès refusé. Vous ne pouvez modifier que votre propre compte.",
      });
    }

    // Si un non-admin tente de modifier le rôle : interdit
    if (isAdmin && rest.role !== undefined) {
      return res.status(403).json({
        message: "Seul un administrateur peut modifier le rôle.",
      });
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
      if (error.code === "P2002" && error.meta?.target?.includes("email")) {
        return res.status(400).json({
          message: "Cet email est déjà utilisé par un autre utilisateur.",
        });
      }

      if (error.message === "Utilisateur non trouvé.") {
        return res.status(404).json({
          message: error.message,
        });
      }

      next(error);

      // return res.status(500).json({
      //   message:
      //     error.message ||
      //     "Erreur serveur lors de la mise à jour de l'utilisateur.",
      // });
    }
  },

  // Désactiver un ou plusieurs utilisateurs
  deactiveUsers: async (req, res, next) => {
    const { userIds, ...extraFields } = req.body;

    // Validation des données
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: "Seul 'userIds' est autorisé.",
      });
    }

    if (!Array.isArray(userIds)) {
      return res.status(400).json({
        message: "Le corps de la requête doit contenir un tableau 'userIds'.",
      });
    }

    if (userIds.length === 0) {
      return res.status(400).json({
        message: "Aucun identifiant d'utilisateur fourni.",
      });
    }

    // Validation des IDs
    const invalidIds = userIds.filter(
      (id) => typeof id !== "string" || !id.trim()
    );
    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: `IDs invalides: ${invalidIds.join(", ")}`,
      });
    }

    try {
      const deactivatedUsers = [];
      const protectedUsers = [];

      await prisma.$transaction(async (tx) => {
        for (const id of userIds) {
          const user = await tx.user.findFirst({
            where: {
              id,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          });

          if (!user) continue;

          // Vérifier si le compte est protégé
          if (
            protectedAccounts.some((entry) => user.email.includes(entry)) ||
            protectedAccounts.some((protectedName) =>
              removeAccents(user.name.toLowerCase()).includes(
                protectedName.toLowerCase()
              )
            )
          ) {
            protectedUsers.push({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            });
            continue;
          }

          // Désactiver l'utilisateur (soft delete)
          await tx.user.update({
            where: { id },
            data: { isActive: false },
          });

          deactivatedUsers.push({
            id: user.id,
            name: user.name,
            role: user.role,
          });
        }
      });

      if (deactivatedUsers.length === 0 && protectedUsers.length === 0) {
        return res.status(404).json({
          message:
            "Aucun utilisateur actif trouvé avec les identifiants fournis.",
        });
      }

      let responseMessage = "";

      if (deactivatedUsers.length > 0) {
        const userCount = deactivatedUsers.length;
        const userNames = deactivatedUsers
          .map((u) => `${u.name} (${u.role})`)
          .join(", ");

        responseMessage += `${userCount} utilisateur${
          userCount > 1 ? "s" : ""
        } désactivé${userCount > 1 ? "s" : ""}: ${userNames}`;
      }

      if (protectedUsers.length > 0) {
        if (responseMessage) responseMessage += ". ";

        const protectedCount = protectedUsers.length;
        const protectedNames = protectedUsers
          .map((u) => `${u.name} (${u.email})`)
          .join(", ");

        responseMessage += `${protectedCount} utilisateur${
          protectedCount > 1 ? "s" : ""
        } protégé${protectedCount > 1 ? "s" : ""} non désactivé${
          protectedCount > 1 ? "s" : ""
        }: ${protectedNames}`;
      }

      console.log("Résultat de la désactivation:", responseMessage);

      return res.status(200).json({
        message: responseMessage,
        deactivatedUsers,
        protectedUsers: protectedUsers.length > 0 ? protectedUsers : undefined,
      });
    } catch (error) {
      if (error.message === "Utilisateur non trouvé.") {
        return res.status(404).json({
          message: error.message || "Erreur.",
        });
      }
      next(error);

      // return res.status(500).json({
      //   message: error.message || "Erreur serveur.",
      //   details:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },

  // Supprimer définitivement un utilisateur (Et toutes les data lui rattaché)
  deleteUser: async (req, res, next) => {
    const { userId } = req.params;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        message:
          "L'identifiant de l'utilisateur est requis et doit être une chaîne de caractères.",
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Vérifier que l'utilisateur existe et n'est pas un ADMIN
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
            email: true,
            posts: { select: { id: true } },
          },
        });

        if (!user) {
          throw new Error("Utilisateur non trouvé");
        }

        if (
          protectedAccounts.some((entry) => user.email.includes(entry)) ||
          protectedAccounts.some((protectedName) =>
            removeAccents(user.name.toLowerCase()).includes(
              protectedName.toLowerCase()
            )
          )
        ) {
          throw new Error("Utilisateur protégé!!! Impossible de le supprimer");
        }

        // 2. Supprimer les tokens révoqués associés
        await tx.revokedToken.deleteMany({
          where: { userId },
        });

        // 3. Supprimer les commentaires de l'utilisateur (s'ils existent)
        await tx.comment.deleteMany({
          where: { visitorEmail: user.email },
        });

        // 4. Pour chaque post de l'utilisateur :
        for (const post of user.posts) {
          // a. Supprimer les relations tags
          await tx.tagsOnPosts.deleteMany({
            where: { postId: post.id },
          });

          // b. Supprimer les commentaires du post
          await tx.comment.deleteMany({
            where: { postId: post.id },
          });
        }

        // 5. Supprimer tous les posts de l'utilisateur
        await tx.post.deleteMany({
          where: { authorId: userId },
        });

        // 6. Finalement supprimer l'utilisateur
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return res.json({
        success: true,
        message:
          "L'Utilisateur et toutes ses données associées ont été supprimés définitivement",
      });
    } catch (error) {
      // Gestion des erreurs spécifiques
      if (error.message === "Utilisateur non trouvé") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      if (error.message === "Impossible de supprimer un administrateur") {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      next(error);

      // return res.status(500).json({
      //   message:
      //     error.message || "Erreur lors de la suppression de l'utilisateur",
      //   details:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },
};

module.exports = {
  usersController,
};
