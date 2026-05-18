import { Queue } from "bullmq";
import { getRedisClient } from "../db/redis.js";
import { logger } from "../config/logger.js";

let mediaQueue = null;

export function getMediaQueue() {
  if (mediaQueue) return mediaQueue;

  const connection = getRedisClient();
  mediaQueue = new Queue("media-jobs", { connection });
  logger.info("BullMQ queue reserved: media-jobs");
  return mediaQueue;
}

