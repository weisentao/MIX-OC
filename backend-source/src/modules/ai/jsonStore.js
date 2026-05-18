import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { env } from "../../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AI_ROOT = path.resolve(__dirname, "../../../data/ai-v1");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function storageRoot() {
  const configuredRoot = String(env.ai?.dataDir || "").trim();
  return path.resolve(configuredRoot || DEFAULT_AI_ROOT);
}

function assertInsideRoot(root, targetPath) {
  const rootPath = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== rootPath && !resolvedTarget.startsWith(`${rootPath}${path.sep}`)) {
    throw buildHttpError(400, "Invalid AI storage path");
  }
  return resolvedTarget;
}

export function createJsonStore(fileName, fallbackValue) {
  const root = storageRoot();
  const filePath = assertInsideRoot(root, path.join(root, fileName));
  let loaded = false;
  let cache = clone(fallbackValue);
  let writeQueue = Promise.resolve();

  async function load() {
    if (loaded) return cache;

    try {
      const text = await readFile(filePath, "utf8");
      cache = text.trim() ? JSON.parse(text) : clone(fallbackValue);
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      cache = clone(fallbackValue);
    }

    loaded = true;
    return cache;
  }

  async function save(nextValue) {
    cache = clone(nextValue);
    loaded = true;
    await mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
    return clone(cache);
  }

  return {
    async read() {
      return clone(await load());
    },

    async write(updater) {
      writeQueue = writeQueue.catch(() => undefined).then(async () => {
        const current = clone(await load());
        const nextValue = await updater(current);
        return save(nextValue);
      });
      return writeQueue;
    },

    filePath
  };
}
