const authController = require("./auth.controller");
const usersController = require("./users.controller");

module.exports = {
  authController: authController.authController,
  generateAccessToken: authController.generateAccessToken,
  postsController: require("./posts.controller"),
  usersController: usersController.usersController,
};
