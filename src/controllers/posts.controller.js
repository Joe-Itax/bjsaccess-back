const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { prisma } = require("../lib/prisma");
const { removeAccents, paginationQuery } = require("../utils/index");

const baseUrl = process.env.BASE_URL || "";

// Fonction utilitaire pour générer un slug unique
async function generateUniqueSlug(title, model) {
  const baseSlug = slugify(title, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma[model].findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${baseSlug}-${counter++}`;
  }
}

const postsController = {
  /* ====================== */
  /* === GESTION DES POSTS === */
  /* ====================== */
  // Créer un nouvel article
  createPost: async (req, res, next) => {
    const {
      title,
      content,
      categoryId,
      authorId,
      tags = [],
      ...extraFields
    } = req.body;

    // Rejet des champs supplémentaires
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: `Champs non autorisés détectés [${Object.keys(extraFields)}]`,
      });
    }

    // Validation des champs obligatoires
    if (!title || !content || !categoryId) {
      return res.status(400).json({
        message: "Titre, contenu et catégorie sont obligatoires",
        requiredFields: ["title", "content", "categoryId"],
      });
    }

    const tagIds = Array.isArray(req.body.tags)
      ? req.body.tags
      : req.body.tags
      ? [req.body.tags]
      : [];

    const featuredImagePath = req.file
      ? `/uploads/featured/${req.file.filename}`
      : null;

    const imagePath = req.file
      ? path.join(
          __dirname,
          "..",
          "..",
          "uploads",
          "featured",
          req.file.filename
        )
      : null;

    try {
      const post = await prisma.$transaction(async (tx) => {
        // Vérifier que la catégorie existe
        const category = await tx.category.findUnique({
          where: { id: categoryId },
        });
        if (!category) throw new Error("Catégorie non trouvée");

        // Vérifier les tags existants
        const existingTags = await tx.tag.findMany({
          where: { id: { in: tagIds } },
        });
        if (existingTags.length !== tagIds.length) {
          throw new Error("Un ou plusieurs tags sont invalides");
        }

        // Créer le post
        const slug = await generateUniqueSlug(title, "post");
        const searchableName = removeAccents(title);

        return await tx.post.create({
          data: {
            title,
            searchableName,
            slug,
            content,
            featuredImage: featuredImagePath,
            authorId: req?.user?.id || authorId,
            categoryId,
            tags: {
              create: tagIds.map((tagId) => ({ tagId })),
            },
          },
          include: {
            category: true,
            tags: { include: { tag: true } },
            author: {
              select: {
                id: true,
                name: true,
                profileImage: true,
              },
            },
          },
        });
      });

      // post.featuredImage = baseUrl + post.featuredImage;

      res.status(201).json({
        message: "Post créer avec succès",
        post,
      });
    } catch (error) {
      if (imagePath) {
        try {
          await fs.promises.unlink(imagePath);
          console.log("Image supprimée :", imagePath);
        } catch (unlinkError) {
          console.error(
            "Erreur lors de la suppression de l'image :",
            unlinkError
          );
        }
      }

      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Récupérer tous les articles (avec pagination)
  getAllPosts: async (req, res, next) => {
    const { page = 1, limit = 10, category, tag } = req.query;

    try {
      const isBackOffice = !req.user;
      const where = {
        ...(!isBackOffice && { published: true }),
        ...(category && { category: { slug: category } }),
        ...(tag && { tags: { some: { tag: { slug: tag } } } }),
      };

      // Sélection des champs de base
      const selectBase = {
        id: true,
        title: true,
        slug: true,
        content: true,
        featuredImage: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
        comments: {
          select: {
            id: true,
            content: true,
            visitorName: true,
            visitorEmail: isBackOffice,
            postId: true,
            isApproved: isBackOffice,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      };

      // Champs supplémentaires pour le back-office
      const selectBackOffice = {
        published: true,
        updatedAt: true,
      };

      const result = await paginationQuery(prisma.post, page, limit, {
        where,
        select: {
          ...selectBase,
          ...(isBackOffice && selectBackOffice),
        },
        orderBy: { createdAt: "desc" },
      });

      if (result.error) {
        return res.status(400).json({
          message: result.error,
        });
      }

      result.data.map((post) => {
        post.featuredImage = baseUrl + post.featuredImage;
        return post;
      });

      res.json({
        ...result,
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Recherche d'articles (avec pagination)
  searchPost: async (req, res, next) => {
    const { q, page = 1, limit = 10 } = req.query;

    const searchTerm = removeAccents(q);

    if (!searchTerm || searchTerm.trim() === "") {
      return res.status(400).json({
        message: "Le terme de recherche est requis",
      });
    }

    try {
      const where = {
        OR: [
          { title: { contains: searchTerm, mode: "insensitive" } },
          { content: { contains: searchTerm, mode: "insensitive" } },
          { searchableName: { contains: searchTerm } },
        ],
      };

      const include = {
        category: true,
        tags: { include: { tag: true } },
        author: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
      };

      const result = await paginationQuery(prisma.post, page, limit, {
        where,
        include,
        orderBy: { createdAt: "desc" },
      });

      if (result.error) {
        return res.status(400).json({
          message: result.error,
        });
      }

      result.data.map((post) => {
        post.featuredImage = baseUrl + post.featuredImage;
        return post;
      });

      res.json({
        searchTerm,
        ...result,
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Récupérer les articles par catégorie (avec pagination)
  getPostsByCategory: async (req, res, next) => {
    const { categorySlug } = req.params;
    const { page = 1, limit = 10 } = req.query;

    try {
      // Vérifier que la catégorie existe
      const category = await prisma.category.findUnique({
        where: { slug: categorySlug },
      });

      if (!category) {
        return res.status(404).json({
          message: "Catégorie non trouvée",
        });
      }

      const where = {
        category: { slug: categorySlug },
        published: true,
      };

      const include = {
        category: true,
        tags: { include: { tag: true } },
        author: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
      };

      const result = await paginationQuery(prisma.post, page, limit, {
        where,
        include,
        orderBy: { createdAt: "desc" },
      });

      if (result.error) {
        return res.status(400).json({
          message: result.error,
        });
      }

      result.data.map((post) => {
        post.featuredImage = baseUrl + post.featuredImage;
        return post;
      });

      res.json({
        category: category.name,
        ...result,
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Récupérer les articles par tag (avec pagination)
  getPostsByTag: async (req, res, next) => {
    const { tagSlug } = req.params;
    const { page = 1, limit = 10 } = req.query;

    try {
      // Vérifier que le tag existe
      const tag = await prisma.tag.findUnique({
        where: { slug: tagSlug },
      });

      if (!tag) {
        return res.status(404).json({
          message: "Tag non trouvé",
        });
      }

      const where = {
        tags: { some: { tag: { slug: tagSlug } } },
        published: true,
      };

      const include = {
        category: true,
        tags: { include: { tag: true } },
        author: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
      };

      const result = await paginationQuery(prisma.post, page, limit, {
        where,
        include,
        orderBy: { createdAt: "desc" },
      });

      if (result.error) {
        return res.status(400).json({
          message: result.error,
        });
      }

      res.json({
        tag: tag.name,
        ...result,
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Récupérer un article par son slug
  getPostById: async (req, res, next) => {
    const { id } = req.params;

    try {
      // Déterminer si la requête vient du back-office
      const isBackOffice = !!req.user;

      const post = await prisma.post.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          slug: true,
          content: true,
          published: isBackOffice,
          featuredImage: true,
          createdAt: true,
          updatedAt: isBackOffice,
          authorId: isBackOffice,
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
          author: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
          comments: {
            select: {
              id: true,
              visitorName: true,
              visitorEmail: isBackOffice,
              content: true,
              isApproved: isBackOffice,
              postId: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!post) {
        return res.status(404).json({
          message: "Article non trouvé",
        });
      }

      // Vérification des permissions
      if (!post.published && !isBackOffice) {
        return res.status(403).json({
          message: "Accès non autorisé - Article non publié",
        });
      }

      // Formater les tags pour une sortie plus propre
      const formattedPost = {
        ...post,
        tags: post.tags.map((tagObj) => tagObj.tag),
      };

      formattedPost.featuredImage = baseUrl + formattedPost.featuredImage;

      res.json({
        post: formattedPost,
      });
    } catch (error) {
      next(error);
      // res.status(500).json({
      //   message: "Erreur lors de la récupération du post",
      //   error:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },

  // Mettre à jour un article
  updatePost: async (req, res, next) => {
    const { id } = req.params;
    req.body.tagIds = Array.isArray(req.body.tagIds)
      ? req.body.tagIds
      : req.body.tagIds
      ? [req.body.tagIds]
      : [];
    const { title, content, categoryId, tagIds, published, ...extraFields } =
      req.body;

    // Rejet des champs supplémentaires
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: "Champs non autorisés détectés",
        rejectedFields: Object.keys(extraFields),
      });
    }

    try {
      let featuredImage;
      let oldImagePath;
      const updatedPost = await prisma.$transaction(async (tx) => {
        // Vérifier que le post existe et appartient à l'utilisateur (ou admin)
        const existingPost = await tx.post.findUnique({
          where: { id },
          include: { author: true },
        });

        if (!existingPost) throw new Error("Article non trouvé");
        if (
          existingPost.authorId !== req.user?.id &&
          req.user?.role !== "ADMIN"
        ) {
          throw new Error("Non autorisé à modifier cet article");
        }

        // Vérifier la catégorie si fournie
        if (categoryId) {
          const category = await tx.category.findUnique({
            where: { id: categoryId },
          });
          if (!category) throw new Error("Catégorie non trouvée");
        }

        // Vérifier les tags si fournis
        if (tagIds.length > 0) {
          const existingTags = await tx.tag.findMany({
            where: { id: { in: tagIds } },
          });
          if (existingTags.length !== tagIds.length) {
            throw new Error("Un ou plusieurs tags sont invalides");
          }
        }

        // Générer un nouveau slug si le titre change
        let slug = existingPost.slug;
        let searchableName;
        if (title && title !== existingPost.title) {
          slug = await generateUniqueSlug(title, "post");
          searchableName = removeAccents(title);
        }

        // Mettre à jour l'image si elle a changé

        if (req.file) {
          oldImagePath = existingPost.featuredImage
            ? path.join(__dirname, "..", "..", existingPost.featuredImage)
            : null;

          // Nouvelle image
          featuredImage = `/uploads/featured/${req.file.filename}`;
        }

        return await tx.post.update({
          where: { id },
          data: {
            title,
            slug,
            content,
            categoryId,
            featuredImage: featuredImage || existingPost.featuredImage,
            published,
            searchableName: title ? searchableName : "",
            ...(tagIds && {
              tags: {
                create: tagIds.map((tagId) => ({ tagId })),
              },
            }),
          },
          include: {
            category: true,
            tags: { include: { tag: true } },
            author: {
              select: {
                id: true,
                name: true,
                profileImage: true,
              },
            },
            comments: true,
          },
        });
      });

      if (oldImagePath && fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
      updatedPost.featuredImage = baseUrl + updatedPost.featuredImage;

      res.json({
        post: updatedPost,
      });
    } catch (error) {
      if (req.file) {
        const imagePath = req.file
          ? path.join(__dirname, "..", "..", req.file.path)
          : null;
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  // Supprimer un article
  deletePost: async (req, res, next) => {
    const { id } = req.params;

    try {
      await prisma.$transaction(async (tx) => {
        // Vérifier que le post existe et appartient à l'utilisateur (ou admin)
        const post = await tx.post.findUnique({
          where: { id },
          include: { author: true },
        });

        if (!post) throw new Error("Article non trouvé");
        if (post.authorId !== req.user?.id && req.user?.role !== "ADMIN") {
          throw new Error("Non autorisé à supprimer cet article");
        }

        // Supprimer le featured image si elle existe
        const featuredPath = post.featuredImage
          ? path.join(__dirname, "..", "..", post.featuredImage)
          : null;

        if (featuredPath && fs.existsSync(featuredPath)) {
          fs.unlinkSync(featuredPath);
        }

        // Supprimer les commentaires
        await tx.comment.deleteMany({ where: { postId: id } });

        // Supprimer les relations tags
        await tx.tagsOnPosts.deleteMany({ where: { postId: id } });

        // Puis supprimer le post
        await tx.post.delete({ where: { id } });
      });

      res.json({
        message: "Article supprimé avec succès",
      });
    } catch (error) {
      next(error);
      // return res.status(500).json({
      //   message: error.message || "Erreur serveur",
      // });
    }
  },

  /* ====================== */
  /* === GESTION DES COMMENTAIRES === */
  /* ====================== */

  // Ajouter un commentaire
  addComment: async (req, res, next) => {
    const { postId } = req.params;
    const { content, visitorName, visitorEmail } = req.body;

    try {
      // Vérifier que le post existe et est publié
      const post = await prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        return res.status(404).json({
          message: "Article non trouvé",
        });
      }

      if (!post.published) {
        return res.status(403).json({
          message: "Impossible de commenter un article non publié",
        });
      }

      // Créer le commentaire
      const comment = await prisma.comment.create({
        data: {
          content,
          visitorName,
          visitorEmail,
          postId,
        },
      });

      res.status(201).json({
        message: "Commentaire ajouté avec succès",
        comment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Récupérer les commentaires d'un article
  getPostComments: async (req, res, next) => {
    const { postId } = req.params;
    const { page = 1, limit = 10, approvedOnly = "true" } = req.query;

    try {
      // Vérifier que le post existe
      const post = await prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        return res.status(404).json({
          message: "Article non trouvé",
        });
      }

      const where = {
        postId,
        ...(approvedOnly === "true" && { isApproved: true }),
      };

      const result = await paginationQuery(prisma.comment, page, limit, {
        where,
        orderBy: { createdAt: "desc" },
      });

      res.json({
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  /* ====================== */
  /* === GESTION DES CATÉGORIES === */
  /* ====================== */

  // Récupérer toutes les catégories
  getAllCategories: async (req, res, next) => {
    const { page, limit } = req.query;
    try {
      const categories = await paginationQuery(prisma.category, page, limit, {
        orderBy: { createdAt: "asc" },
      });

      res.json({
        categories,
      });
    } catch (error) {
      next(error);
    }
  },

  // Créer une nouvelle catégorie
  createCategory: async (req, res, next) => {
    const { name, description } = req.body;

    try {
      // Générer un slug unique
      const slug = await generateUniqueSlug(name, "category");

      const category = await prisma.category.create({
        data: {
          name,
          slug,
          description,
        },
      });

      res.status(201).json({
        message: "Catégorie créée avec succès",
        category,
      });
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(400).json({
          message: "Une catégorie avec ce nom existe déjà",
        });
      }
      next(error);
    }
  },

  //supprimer une categorie
  deleteCategory: async (req, res, next) => {
    const { categoryId } = req.params;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Vérifier l'existence de la catégorie
        const category = await tx.category.findUnique({
          where: { id: categoryId },
          select: { id: true, name: true, _count: { select: { posts: true } } },
        });

        if (!category)
          return { success: false, message: "Catégorie non trouvée" };

        // 2. Gérer les posts associés
        if (category._count.posts > 0) {
          const defaultCategoryId = await ensureDefaultCategoryExists(tx);
          await tx.post.updateMany({
            where: { categoryId },
            data: { categoryId: defaultCategoryId },
          });
        }

        // 3. Suppression
        await tx.category.delete({ where: { id: categoryId } });

        return {
          success: true,
          message: `Catégorie "${category.name}" supprimée - ${category._count.posts} posts réassignés`,
        };
      });

      return res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      if (error.code === "P2025") {
        return res.status(404).json({
          success: false,
          message: "La catégorie n'existe plus",
        });
      }
      next(error);
    }
  },

  /* ====================== */
  /* === GESTION DES TAGS === */
  /* ====================== */

  // Récupérer tous les tags
  getAllTags: async (req, res, next) => {
    const { page, limit } = req.query;
    try {
      const tags = await paginationQuery(prisma.tag, page, limit, {
        orderBy: { createdAt: "asc" },
      });

      res.json({
        tags,
      });
    } catch (error) {
      next(error);
    }
  },

  // Créer un nouveau tag
  createTag: async (req, res, next) => {
    const { name } = req.body;

    try {
      // Générer un slug unique
      const slug = await generateUniqueSlug(name, "tag");

      const tag = await prisma.tag.create({
        data: {
          name,
          slug,
        },
      });

      res.status(201).json({
        message: "Tag créé avec succès",
        tag,
      });
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(400).json({
          message: "Un tag avec ce nom existe déjà",
        });
      }
      next(error);
    }
  },

  //supprimer un tag
  deleteTag: async (req, res, next) => {
    const { tagId } = req.params;
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Vérifier que le tag existe
        const tag = await tx.tag.findUnique({
          where: { id: tagId },
        });

        if (!tag) {
          throw new Error("Catégorie non trouvée");
        }

        // 2. Supprimer le tag
        await tx.tag.delete({ where: { id: tagId } });
      });
      return res.status(200).json({
        message: "Tag supprimée avec succès",
      });
    } catch (error) {
      next(error);
    }
  },

  /* ====================== */
  /* === FONCTIONS ADMIN === */
  /* ====================== */

  // Modérer un commentaire (approuver/rejeter)
  moderateComment: async (req, res, next) => {
    const { commentId } = req.params;
    const { action } = req.body; // "approve" ou "reject"

    try {
      // Vérifier que le commentaire existe
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        return res.status(404).json({
          message: "Commentaire non trouvé",
        });
      }

      const updatedComment = await prisma.comment.update({
        where: { id: commentId },
        data: {
          isApproved: action === "approve",
        },
      });

      res.json({
        message: `Commentaire ${action === "approve" ? "approuvé" : "rejeté"}`,
        comment: updatedComment,
      });
    } catch (error) {
      next(error);
    }
  },

  // Supprimer un commentaire (admin)
  deleteComment: async (req, res, next) => {
    const { commentId } = req.params;

    try {
      // Vérifier que le commentaire existe
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });

      if (!comment) {
        return res.status(404).json({
          message: "Commentaire non trouvé",
        });
      }

      await prisma.comment.delete({
        where: { id: commentId },
      });

      res.json({
        message: "Commentaire supprimé avec succès",
      });
    } catch (error) {
      next(error);
    }
  },

  getBlogDashboardStats: async (req, res, next) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(startOfMonth.getTime() - 1);
      const threeMonthsAgo = new Date(new Date().setMonth(now.getMonth() - 3));

      // Formatage des dates pour comparaison
      const formatDateForComparison = (date) => {
        const d = new Date(date);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate())
          .toISOString()
          .split("T")[0];
      };

      // Exécution en parallèle de toutes les requêtes
      const [
        totalPosts,
        publishedPosts,
        newPostsThisMonth,
        totalComments,
        approvedComments,
        newCommentsThisMonth,
        totalCategories,
        totalTags,
        postsLastMonth,
        postsGroup,
        commentsGroup,
        popularPosts,
      ] = await Promise.all([
        // Statistiques de base
        prisma.post.count(),
        prisma.post.count({ where: { published: true } }),
        prisma.post.count({
          where: {
            createdAt: { gte: startOfMonth },
            published: true,
          },
        }),
        prisma.comment.count(),
        prisma.comment.count({ where: { isApproved: true } }),
        prisma.comment.count({
          where: {
            createdAt: { gte: startOfMonth },
            isApproved: true,
          },
        }),
        prisma.category.count(),
        prisma.tag.count(),
        prisma.post.count({
          where: {
            createdAt: {
              gte: lastMonthStart,
              lte: lastMonthEnd,
            },
            published: true,
          },
        }),

        // Données pour graphiques - Posts par date
        prisma.post.groupBy({
          by: ["createdAt"],
          where: {
            createdAt: { gte: threeMonthsAgo },
            published: true,
          },
          _count: { id: true },
          orderBy: { createdAt: "asc" },
        }),

        // Données pour graphiques - Commentaires par date
        prisma.comment.groupBy({
          by: ["createdAt"],
          where: {
            createdAt: { gte: threeMonthsAgo },
            isApproved: true,
          },
          _count: { id: true },
          orderBy: { createdAt: "asc" },
        }),

        // Posts les plus populaires
        prisma.post.findMany({
          where: { published: true },
          select: {
            id: true,
            title: true,
            slug: true,
            _count: { select: { comments: true } },
          },
          orderBy: { comments: { _count: "desc" } },
          take: 5,
        }),
      ]);

      // Calcul des taux
      const postsGrowthRate =
        postsLastMonth === 0
          ? newPostsThisMonth > 0
            ? 100
            : 0
          : ((newPostsThisMonth - postsLastMonth) / postsLastMonth) * 100;

      const approvalRate =
        totalComments === 0 ? 0 : (approvedComments / totalComments) * 100;

      // Préparation des données combinées pour les graphiques
      const combinedChartData = [];
      const dateMap = new Map();

      // Traitement des posts
      postsGroup.forEach((post) => {
        const dateKey = formatDateForComparison(post.createdAt);
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { posts: 0, comments: 0 });
        }
        dateMap.get(dateKey).posts += post._count.id;
      });

      // Traitement des commentaires
      commentsGroup.forEach((comment) => {
        const dateKey = formatDateForComparison(comment.createdAt);
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { posts: 0, comments: 0 });
        }
        dateMap.get(dateKey).comments += comment._count.id;
      });

      // Remplissage des dates sans activité
      const currentDate = new Date(threeMonthsAgo);
      while (currentDate <= now) {
        const dateKey = formatDateForComparison(currentDate);
        const data = dateMap.get(dateKey) || { posts: 0, comments: 0 };

        combinedChartData.push({
          date: new Date(dateKey),
          posts: data.posts,
          comments: data.comments,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Formatage des posts populaires
      const formattedPopularPosts = popularPosts.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        commentsCount: post._count.comments,
      }));

      return res.status(200).json({
        // Statistiques de base
        totalPosts,
        publishedPosts,
        draftPosts: totalPosts - publishedPosts,
        newPostsThisMonth,
        totalComments,
        approvedComments,
        pendingComments: totalComments - approvedComments,
        newCommentsThisMonth,
        totalCategories,
        totalTags,

        // Indicateurs
        postsGrowthRate: Math.round(postsGrowthRate),
        approvalRate: Math.round(approvalRate),

        // Données combinées pour graphiques
        charts: combinedChartData,

        // Classements
        popularPosts: formattedPopularPosts,
      });
    } catch (error) {
      next(error);
      // res.status(500).json({
      //   message: "Erreur lors de la récupération des statistiques",
      //   error:
      //     process.env.NODE_ENV === "development" ? error.message : undefined,
      // });
    }
  },
};

async function ensureDefaultCategoryExists(tx) {
  let defaultCategory = await tx.category.findFirst({
    where: { name: "Non classé" },
  });

  if (!defaultCategory) {
    defaultCategory = await tx.category.create({
      data: {
        name: "Non classé",
        slug: "non-classe",
        description: "Articles non classés",
      },
    });
  }

  return defaultCategory.id;
}

module.exports = { postsController, generateUniqueSlug };
