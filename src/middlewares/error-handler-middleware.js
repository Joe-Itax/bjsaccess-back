module.exports = (err, req, res, next) => {
  console.error("❌ Erreur attrapée :", err);

  const status =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  return res.status(status).json({
    message: err.message || "Une erreur inconnue est survenue",
    error: process.env.NODE_ENV === "development" ? err : undefined,
  });
};
