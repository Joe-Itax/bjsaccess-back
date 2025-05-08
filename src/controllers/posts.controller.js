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
  // Créer un nouvel article
  createPost: async (req, res, next) => {
    const {
      title,
      content,
      categoryId,
      tags = [],
      featuredImage,
      ...extraFields
    } = req.body;

    // Rejet des champs supplémentaires
    if (Object.keys(extraFields).length > 0) {
      return res.status(400).json({
        success: false,
        message: `Champs non autorisés détectés ${Object.keys(extraFields)}`,
        rejectedFields: Object.keys(extraFields),
      });
    }

    // Validation des champs obligatoires
    if (!title || !content || !categoryId) {
      return res.status(400).json({
        success: false,
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
            authorId: req.user.id,
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
        success: true,
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
    const { page = 1, limit = 10, category, tag, published } = req.query;

    try {
      const where = {
        ...(published && { published: published === "true" }),
        ...(category && { category: { slug: category } }),
        ...(tag && { tags: { some: { tag: { slug: tag } } } }),
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
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
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
    const { q: searchTerm, page = 1, limit = 10 } = req.query;

    if (!searchTerm || searchTerm.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Le terme de recherche est requis",
      });
    }

    try {
      const where = {
        OR: [
          { title: { contains: searchTerm, mode: "insensitive" } },
          { content: { contains: searchTerm, mode: "insensitive" } },
          { searchableName: { contains: searchTerm.toLowerCase() } },
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
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
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
          success: false,
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
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
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
          success: false,
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
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
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
  getPostBySlug: async (req, res, next) => {
    const { slug } = req.params;

    try {
      const post = await prisma.post.findUnique({
        where: { slug },
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
          comments: {
            where: { isApproved: true },
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

      // Ne pas renvoyer le contenu si non publié et pas l'auteur/admin
      if (
        !post.published &&
        (!req.user ||
          (req.user.id !== post.authorId && req.user.role !== "ADMIN"))
      ) {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé",
        });
      }

      res.json({
        success: true,
        post,
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
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
        success: false,
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
        success: true,
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
        if (post.authorId !== req.user.id && req.user.role !== "ADMIN") {
          throw new Error("Non autorisé à supprimer cet article");
        }

        // Supprimer les relations tags d'abord
        await tx.tagsOnPosts.deleteMany({ where: { postId: id } });

        // Puis supprimer le post
        await tx.post.delete({ where: { id } });
      });

      res.json({
        success: true,
        message: "Article supprimé avec succès",
      });
    } catch (error) {
      next(error);
      return res.status(500).json({
        message: error.message || "Erreur serveur",
      });
    }
  },
};

module.exports = postsController;
