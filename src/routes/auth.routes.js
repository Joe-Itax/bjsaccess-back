const { Router } = require("express");
const {
  authenticate,
  attachTokenRefreshToResponse,
} = require("../middlewares/index.middleware");
const { authController } = require("../controllers/index.controller");

const authRouter = Router();

authRouter.post(
  "/check-auth",
  authenticate(),
  attachTokenRefreshToResponse,
  authController.checkAuth
);
authRouter.post("/login", authController.login);
authRouter.post("/logout", authenticate(), authController.logout);
authRouter.post(
  "/refresh-token",
  // authenticate(),
  // attachTokenRefreshToResponse,
  authController.refreshToken
);

module.exports = authRouter;
