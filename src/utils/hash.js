const bcrypt = require("bcrypt");

const hashValue = async (value) => {
  if (!value) throw new Error("Aucune valeur à hasher !");
  return bcrypt.hashSync(value, 10);
};

const compareHash = async (value, hashedValue) => {
  if (!value || !hashedValue) throw new Error("Valeur ou hash manquant !");
  return bcrypt.compareSync(value, hashedValue);
};

module.exports = { hashValue, compareHash };
