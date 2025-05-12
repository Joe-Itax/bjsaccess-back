const { Router } = require("express");
const { usersController } = require("../controllers/index.controller");
const hasRole = require("../middlewares/role.middleware");
const { authenticate } = require("../middlewares/index.middleware");
const usersRouter = Router();

usersRouter.get("/search", authenticate(), usersController.searchUser);
usersRouter.get("/", authenticate(), usersController.getAllUsers);
usersRouter.post(
  "/",
  authenticate(),
  hasRole(["ADMIN"]),
  usersController.createUser
);
usersRouter.get("/:userId", authenticate(), usersController.getUserById);
usersRouter.put("/:userId", authenticate(), usersController.updateUser);
usersRouter.delete(
  "/deactivate",
  authenticate(),
  hasRole("ADMIN"),
  usersController.deactiveUsers
);
usersRouter.delete(
  "/:userId",
  authenticate(),
  hasRole("ADMIN"),
  usersController.deleteUser
);

module.exports = usersRouter;
