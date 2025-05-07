async function paginationQuery(model, page = 1, limit = 10, options = {}) {
  try {
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.max(1, parseInt(limit) || 10);
    const skip = (page - 1) * limit;

    if (!model || !model.count) {
      return {
        error: `Modèle invalide fourni à paginationQuery. Modele: ${model}`,
      };
    }

    // Récuperation des filtres s'ils existent
    const where = options.where || {};

    //Récupération du nombre total d'éléments
    const totalItems = await model.count({ where });
    const totalPages = Math.ceil(totalItems / limit);

    // Vérifier si la page demandée est valide
    if (page > totalPages && totalItems > 0) {
      return {
        error: `La page ${page} n'existe pas. Dernière page disponible : ${totalPages}.`,
        totalItems,
        limitPerPage: limit,
        totalPages,
        currentPage: page,
        data: [],
      };
    }

    //Récupération des éléments paginés
    const queryOptions = { skip, take: limit, ...options };

    const data = await model.findMany(queryOptions);

    return {
      totalItems,
      limitPerPage: limit,
      totalPages,
      currentPage: page,
      data,
    };
  } catch (error) {
    console.error("Erreur dans paginationQuery:", error);
    return {
      error: "Erreur lors de la pagination",
      details: error.message,
    };
  }
}

module.exports = paginationQuery;
