const authController = require("./auth.controller");
const usersController = require("./users.controller");
const postController = require("./posts.controller");

module.exports = {
  authController: authController.authController,
  generateAccessToken: authController.generateAccessToken,
  postsController: postController.postsController,
  generateUniqueSlug: postController.generateUniqueSlug,
  usersController: usersController.usersController,
};
