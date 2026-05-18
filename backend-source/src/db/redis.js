import Redis from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let redisClient = null;
let redisReady = false;

export function buildRedisOptions(redisEnv = env.redis) {
  return {
    host: redisEnv.host,
    port: redisEnv.port,
    password: redisEnv.password || undefined,
    db: redisEnv.db,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null
  };
}

export function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = new Redis(buildRedisOptions());

  redisClient.on("error", (error) => {
    logger.warn("Redis client error (reserved integration).", { message: error.message });
  });

  return redisClient;
}

export async function pingRedis() {
  try {
    const client = getRedisClient();
    await client.connect();
    await client.ping();
    redisReady = true;
    logger.info("Redis connection ready.");
    return true;
  } catch (error) {
    redisReady = false;
    logger.warn("Redis connection check failed. Service still starts in phase 1.", {
      message: error.message
    });
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    return false;
  }
}

export function isRedisReady() {
  return redisReady;
}
