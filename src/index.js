require("dotenv").config();

const express = require("express");

const cookieParser = require("cookie-parser");
const cors = require("cors");
const passport = require("passport");

const {
  prismaErrorHandler,
  corsLogger,
  security,
} = require("./middlewares/index.middleware");
const {
  authBaseURI,
  postsBaseURI,
  usersBaseURI,
} = require("./config/path.config");
const {
  authRouter,
  postsRouter,
  usersRouter,
} = require("./routes/index.routes");
// const isProduction = process.env.NODE_ENV === "production";

/**
 * ------------------  GENERAL SETUP  ---------------
 */
const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  `http://localhost:${PORT}`,
  `http://localhost:3000`,
  `http://localhost:3001`,
  `https://bjsaccess.vercel.app/`,
  `https://bjsaccess-back-office.vercel.app/`,
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`Blocked CORS request from origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  exposedHeaders: ["set-cookie", "x-auth-token"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Set-Cookie",
  ],
  optionsSuccessStatus: 200,
};

app.use(...security());
app.use(cookieParser());
app.use(corsLogger);
app.use(cors(corsOptions));

/**
 * -------------- PASSPORT AUTHENTICATION ----------------
 */
app.use(passport.initialize());
require("./config/passport-strategies/jwt");

/**
 * -------------- JOB ----------------
 */
require("./job/cleanup-revoked-tokens");

/**
 * -------------- ROUTES ----------------
 */

app.get("/", (req, res) => {
  res.send("Hello, BJS ACCESS");
});

app.use(authBaseURI, authRouter);
app.use(postsBaseURI, postsRouter);
app.use(usersBaseURI, usersRouter);

/**
 * Middleware d’erreur Prisma
 */
app.use(prismaErrorHandler);

/**
 * -------------- RUN SERVER ----------------
 */

app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
