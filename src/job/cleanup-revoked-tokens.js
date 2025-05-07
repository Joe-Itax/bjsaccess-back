const cron = require("node-cron");
const { prisma } = require("../lib/prisma");

// Planifie un job toutes les 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("🔵 Initialisation du nettoyage des tokens révoqués...");
  try {
    console.log("🟢 Début du nettoyage des tokens révoqués expirés...");
    const { count } = await prisma.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    console.log(`🟢 ${count} token(s) révoqué(s) nettoyé(s)`);
  } catch (error) {
    console.error("🔴 Erreur lors du nettoyage des tokens:", error);
  }
});
