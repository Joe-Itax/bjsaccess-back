module.exports = {
  authenticate: require("./authenticate.middleware"),
  corsLogger: require("./cors-logger.middleware"),
  prismaErrorHandler: require("./prisma-error-handler.middleware"),
  role: require("./role.middleware"),
  security: require("./security.middleware"),
};
