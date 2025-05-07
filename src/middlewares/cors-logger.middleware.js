function corsLogger(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    console.log(`[CORS-LOGGER] Requête reçue depuis l'origine: ${origin}`);
  } else {
    console.log(
      `[CORS-LOGGER] Requête sans origine (probablement interne ou serveur)`
    );
  }
  next();
}

module.exports = corsLogger;
