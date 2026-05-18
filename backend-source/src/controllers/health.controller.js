import { env } from "../config/env.js";
import { isMySQLReady } from "../db/mysql.js";

export function buildHealthPayload({
  nodeEnv = env.nodeEnv,
  mysqlReady = isMySQLReady(),
  now = () => new Date()
} = {}) {
  return {
    ok: true,
    service: "xjg-api",
    env: nodeEnv,
    time: now().toISOString(),
    live: true,
    ready: Boolean(mysqlReady),
    checks: {
      mysql: {
        ready: Boolean(mysqlReady)
      }
    }
  };
}

export function getHealth(req, res) {
  res.json(buildHealthPayload());
}
