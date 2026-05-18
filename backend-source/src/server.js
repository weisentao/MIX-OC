import app from "./app.js";
import { env, validateRequiredEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { ensureAuthTables, pingMySQL } from "./db/mysql.js";
import { pingRedis } from "./db/redis.js";

async function bootstrap() {
  validateRequiredEnv();

  const mysqlReady = await pingMySQL();
  if (mysqlReady) {
    await ensureAuthTables();
  } else {
    logger.warn("MySQL unavailable. Auth API is running in memory fallback mode.");
  }
  await pingRedis();

  app.listen(env.port, () => {
    logger.info(`xjg-api started on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start xjg-api", { message: error.message, stack: error.stack });
  process.exit(1);
});
