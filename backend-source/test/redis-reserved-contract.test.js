import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRedisOptions } from "../src/db/redis.js";

test("reserved Redis client does not retry forever when Redis is unavailable", () => {
  const options = buildRedisOptions({
    host: "127.0.0.1",
    port: 6379,
    password: "",
    db: 0
  });

  assert.equal(options.lazyConnect, true);
  assert.equal(options.enableOfflineQueue, false);
  assert.equal(options.maxRetriesPerRequest, 1);
  assert.equal(options.retryStrategy(), null);
});
