const multer = require("multer");
const path = require("path");

// Limite de 5 Mo
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/featured");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const rawTitle = req.body.title || "post";
    const titleSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
    cb(null, `${titleSlug}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  // if (!allowedTypes.includes(file.mimetype)) {
  //   return cb(new Error("Type de fichier non autorisé"), false);
  // }
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Seules les images sont autorisées"), false);
  }
  cb(null, true);
};

const uploadFeaturedImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
}).single("featuredImage");

module.exports = uploadFeaturedImage;
