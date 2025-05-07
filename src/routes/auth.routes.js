const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middlewares/authenticate.middleware");
const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", authenticate, authController.logout);
authRouter.get("/check-auth", authenticate, authController.checkAuth);

module.exports = authRouter;
