import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isMySQLReady, mysqlPool } from "../db/mysql.js";
import { env } from "../config/env.js";

const STATE_ID = "main";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fallbackDir = path.resolve(env.appState?.fallbackDir || path.resolve(__dirname, "../../data"));
const fallbackFile = path.join(fallbackDir, "app-state-main.json");

async function readFallbackState() {
  try {
    return JSON.parse(await readFile(fallbackFile, "utf8"));
  } catch {
    return {};
  }
}

async function writeFallbackState(state) {
  await mkdir(fallbackDir, { recursive: true });
  await writeFile(fallbackFile, JSON.stringify(state, null, 2), "utf8");
}

export async function getMainAppState(req, res) {
  if (!isMySQLReady()) {
    return res.json(await readFallbackState());
  }

  const [rows] = await mysqlPool.execute("SELECT data_json FROM app_states WHERE id = ? LIMIT 1", [STATE_ID]);
  if (!rows.length) return res.json({});
  return res.json(JSON.parse(rows[0].data_json || "{}"));
}

export async function saveMainAppState(req, res) {
  const state = req.body && typeof req.body === "object" ? req.body : {};

  if (!isMySQLReady()) {
    await writeFallbackState(state);
    return res.json({ ok: true, storage: "file" });
  }

  await mysqlPool.execute(
    `INSERT INTO app_states (id, data_json, updated_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [STATE_ID, JSON.stringify(state), req.auth?.sub || req.auth?.id || ""]
  );
  return res.json({ ok: true, storage: "mysql" });
}
