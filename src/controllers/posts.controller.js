const { prisma } = require("../lib/prisma");
const slugify = require("slugify");
const { removeAccents, paginationQuery } = require("../utils/index");

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
      featuredImage,
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

    try {
      const post = await prisma.$transaction(async (tx) => {
        // Vérifier que la catégorie existe
        const category = await tx.category.findUnique({
          where: { id: categoryId },
        });
        if (!category) throw new Error("Catégorie non trouvée");

        // Vérifier les tags existants
        const existingTags = await tx.tag.findMany({
          where: { id: { in: tags } },
        });
        if (existingTags.length !== tags.length) {
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
            featuredImage,
            authorId: req?.user?.id || authorId,
            categoryId,
            tags: {
              create: tags.map((tagId) => ({ tagId })),
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

      res.status(201).json({
        message: "Post créer avec succès",
        post,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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

      res.json({
        ...result,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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

      res.json({
        searchTerm,
        ...result,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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

      res.json({
        category: category.name,
        ...result,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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
          published: isBackOffice, // Inclure 'published' seulement pour le back-office
          featuredImage: true,
          createdAt: true,
          updatedAt: isBackOffice, // Inclure 'updatedAt' seulement pour le back-office
          authorId: isBackOffice, // Inclure 'authorId' seulement pour le back-office
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
            where: { isApproved: true },
            select: {
              id: true,
              content: true,
              createdAt: true,
              visitorName: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Article non trouvé",
        });
      }

      // Vérification des permissions
      if (!post.published && !isBackOffice) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé - Article non publié",
        });
      }

      // Formater les tags pour une sortie plus propre
      const formattedPost = {
        ...post,
        tags: post.tags.map((tagObj) => tagObj.tag),
      };

      res.json({
        success: true,
        post: formattedPost,
      });
    } catch (error) {
      next(error);
    }
  },

  // Mettre à jour un article
  updatePost: async (req, res, next) => {
    const { id } = req.params;
    const {
      title,
      content,
      categoryId,
      tags,
      featuredImage,
      published,
      ...extraFields
    } = req.body;

    // Rejet des champs supplémentaires
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        message: "Champs non autorisés détectés",
        rejectedFields: Object.keys(extraFields),
      });
    }

    try {
      const updatedPost = await prisma.$transaction(async (tx) => {
        // Vérifier que le post existe et appartient à l'utilisateur (ou admin)
        const existingPost = await tx.post.findUnique({
          where: { id },
          include: { author: true },
        });

        if (!existingPost) throw new Error("Article non trouvé");
        if (
          existingPost.authorId !== req.user.id &&
          req.user.role !== "ADMIN"
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
        if (tags) {
          const existingTags = await tx.tag.findMany({
            where: { id: { in: tags } },
          });
          if (existingTags.length !== tags.length) {
            throw new Error("Un ou plusieurs tags sont invalides");
          }
        }

        // Mettre à jour les tags si nécessaire
        if (tags) {
          await tx.tagsOnPosts.deleteMany({ where: { postId: id } });
        }

        // Générer un nouveau slug si le titre change
        let slug = existingPost.slug;
        let searchableName;
        if (title && title !== existingPost.title) {
          slug = await generateUniqueSlug(title, "post");
          searchableName = removeAccents(title);
        }

        return await tx.post.update({
          where: { id },
          data: {
            title,
            slug,
            content,
            categoryId,
            featuredImage,
            published,
            searchableName: title ? searchableName : "",
            ...(tags && {
              tags: {
                create: tags.map((tagId) => ({ tagId })),
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
          },
        });
      });

      res.json({
        post: updatedPost,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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

        // Supprimer les relations tags d'abord
        await tx.tagsOnPosts.deleteMany({ where: { postId: id } });

        // Puis supprimer le post
        await tx.post.delete({ where: { id } });
      });

      res.json({
        message: "Article supprimé avec succès",
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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
      const categories = await paginationQuery(prisma.category, page, limit);

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

  /* ====================== */
  /* === GESTION DES TAGS === */
  /* ====================== */

  // Récupérer tous les tags
  getAllTags: async (req, res, next) => {
    const { page, limit } = req.query;
    try {
      const tags = await paginationQuery(prisma.tag, page, limit);

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
};

module.exports = postsController;
