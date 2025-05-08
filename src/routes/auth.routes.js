const { Router } = require("express");
const authenticate = require("../middlewares/authenticate.middleware");
const { authController } = require("../controllers/index.controller");
const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", authenticate, authController.logout);
authRouter.get("/check-auth", authenticate, authController.checkAuth);

module.exports = authRouter;
