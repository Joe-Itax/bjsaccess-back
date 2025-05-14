// module.exports = postsRouter;
const { Router } = require("express");
const postsRouter = Router();
const { postsController } = require("../controllers/posts.controller");
const {
  authenticate,
  attachTokenRefreshToResponse,
  uploadFeaturedImage,
  optionnalAuth,
} = require("../middlewares/index.middleware");
const { check } = require("express-validator");

// Validation commune
const postValidation = [
  check("title").notEmpty().withMessage("Le titre est requis"),
  check("content").notEmpty().withMessage("Le contenu est requis"),
  check("categoryId").isUUID().withMessage("ID de catégorie invalide"),
];

// ======================================
// === ROUTES PUBLIQUES (FRONT OFFICIEL) ===
// ======================================

// Articles
postsRouter.get("/", postsController.getAllPosts);
postsRouter.get("/search", postsController.searchPost);
postsRouter.get("/:id", optionnalAuth, postsController.getPostById);
postsRouter.get("/category/:slug", postsController.getPostsByCategory);
postsRouter.get("/tag/:slug", postsController.getPostsByTag);

// Commentaires
postsRouter.post(
  "/:postId/comments",
  [
    check("content").notEmpty().withMessage("Le contenu est requis"),
    check("visitorName").notEmpty().withMessage("Le nom est requis"),
    check("visitorEmail").isEmail().withMessage("Email invalide"),
  ],
  postsController.addComment
);
postsRouter.get("/:postId/comments", postsController.getPostComments);

// =====================================
// === ROUTES PROTÉGÉES (BACK-OFFICE) ===
// =====================================

// Articles
postsRouter.post(
  "/admin",
  authenticate(),
  attachTokenRefreshToResponse,
  uploadFeaturedImage,
  postValidation,
  postsController.createPost
);
postsRouter.put(
  "/admin/:id",
  authenticate(),
  attachTokenRefreshToResponse,
  uploadFeaturedImage,
  postsController.updatePost
);
postsRouter.delete(
  "/admin/:id",
  authenticate(),
  attachTokenRefreshToResponse,
  postsController.deletePost
);

// Modération des commentaires
postsRouter.put(
  "/admin/:postId/comments/:commentId",
  authenticate(),
  attachTokenRefreshToResponse,
  postsController.moderateComment
);
postsRouter.delete(
  "/admin/:postId/comments/:commentId",
  authenticate(),
  attachTokenRefreshToResponse,
  postsController.deleteComment
);

// ==============================
// === GESTION DES CATÉGORIES ===
// ==============================
postsRouter.get("/categories/all", postsController.getAllCategories);
postsRouter.post(
  "/admin/categories",
  authenticate(),
  attachTokenRefreshToResponse,
  [check("name").notEmpty().withMessage("Le nom est requis")],
  postsController.createCategory
);

// ========================
// === GESTION DES TAGS ===
// ========================
postsRouter.get("/tags/all", postsController.getAllTags);
postsRouter.post(
  "/admin/tags",
  authenticate(),
  attachTokenRefreshToResponse,
  [check("name").notEmpty().withMessage("Le nom est requis")],
  postsController.createTag
);

// ========================
// === STATS ===
// ========================
postsRouter.get(
  "/admin/dashboard/stats",
  authenticate(),
  attachTokenRefreshToResponse,
  postsController.getBlogDashboardStats
);

module.exports = postsRouter;
