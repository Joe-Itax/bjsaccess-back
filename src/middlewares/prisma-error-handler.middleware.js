const { Prisma } = require("../lib/prisma");
function prismaErrorHandler(err, req, res, next) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("💥 Prisma Known Error:", err.message);

    // Exemple d’erreurs connues
    switch (err.code) {
      case "P2002":
        return res.status(409).json({ error: "Donnée déjà existante." });
      case "P2025":
        return res.status(404).json({ error: "Ressource introuvable." });
      default:
        return res.status(500).json({ error: "Erreur Prisma inconnue." });
    }
  }

  // Si c’est pas Prisma, on passe au suivant
  next(err);
}

module.exports = prismaErrorHandler;
