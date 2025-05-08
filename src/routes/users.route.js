const { Router } = require("express");
const authenticate = require("../middlewares/authenticate.middleware");
const { usersController } = require("../controllers/index.controller");
const usersRouter = Router();

usersRouter.get("/search", usersController.searchUser);
usersRouter.get("/", usersController.getAllUsers);
usersRouter.post("/", usersController.createUser);
usersRouter.get("/:userId", usersController.getUserById);
usersRouter.put("/:userId", usersController.updateUser);
usersRouter.delete("/:userId", usersController.deleteUser);

module.exports = usersRouter;
