const express = require("express");
const helmet = require("helmet");

function securityMiddleware() {
  return [
    // 🛡️ Protection basique contre attaques type XSS, Clickjacking, etc.
    helmet(),

    // 📦 Limitation taille des requêtes JSON et URL Encoded
    express.json({ limit: "1mb" }),
    express.urlencoded({ extended: true, limit: "1mb" }),

    // 🔒 Forcer HTTPS en prod
    (req, res, next) => {
      if (
        process.env.NODE_ENV === "production" &&
        req.headers["x-forwarded-proto"] !== "https"
      ) {
        return res.redirect(`https://${req.headers.host}${req.url}`);
      }
      next();
    },

    // 🪵 Logger erreurs serveur (status 500+)
    (err, req, res, next) => {
      if (res.headersSent) return next(err);
      if (err.status >= 500) {
        console.error("[SERVER ERROR]", {
          method: req.method,
          url: req.url,
          body: req.body,
          error: err.message,
        });
      }
      next(err);
    },
  ];
}

module.exports = securityMiddleware;
