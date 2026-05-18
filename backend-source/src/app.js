import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { assignRequestId, requestLogger } from "./middlewares/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

const app = express();

const corsOptions = env.cors.origins.length
  ? {
      origin(origin, callback) {
        if (!origin || env.cors.origins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: env.cors.credentials,
      methods: env.cors.methods
    }
  : undefined;

app.use(cors(corsOptions));
app.use(assignRequestId);
app.use(express.json({ limit: env.requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));
app.use(requestLogger);

app.use(env.apiPrefix, routes);
app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
