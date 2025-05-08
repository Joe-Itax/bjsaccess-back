const { Router } = require("express");
const postsRouter = Router();
const postsController = require("../controllers/posts.controller");
const {
  authenticate,
  attachTokenRefreshToResponse,
} = require("../middlewares/index.middleware");
const { check } = require("express-validator");

// Validation commune
const postValidation = [
  check("title").notEmpty().withMessage("Le titre est requis"),
  check("content").notEmpty().withMessage("Le contenu est requis"),
  check("categoryId").isUUID().withMessage("ID de catégorie invalide"),
];

// Routes publiques
postsRouter.get("/", postsController.getAllPosts);
postsRouter.get("/:slug", postsController.getPostBySlug);
postsRouter.get("/search", postsController.searchPost);
postsRouter.get("/category/:categorySlug", postsController.getPostsByCategory);
postsRouter.get("/tag/:tagSlug", postsController.getPostsByTag);

// Routes protégées
postsRouter.post(
  "/",
  authenticate(),
  attachTokenRefreshToResponse,
  postValidation,
  postsController.createPost
);

postsRouter.put(
  "/:id",
  authenticate(),
  attachTokenRefreshToResponse,
  postValidation,
  postsController.updatePost
);

postsRouter.delete(
  "/:id",
  authenticate(),
  attachTokenRefreshToResponse,
  postsController.deletePost
);

module.exports = postsRouter;
