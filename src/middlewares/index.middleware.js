const auth = require("./authenticate.middleware");

module.exports = {
  authenticate: auth.authenticate,
  attachTokenRefreshToResponse: auth.attachTokenRefreshToResponse,
  corsLogger: require("./cors-logger.middleware"),
  prismaErrorHandler: require("./prisma-error-handler.middleware"),
  role: require("./role.middleware"),
  security: require("./security.middleware"),
  uploadFeaturedImage: require("./upload"),
  optionnalAuth: require("./optional-auth.middleware"),
  errorHandler: require("./error-handler-middleware"),
};
