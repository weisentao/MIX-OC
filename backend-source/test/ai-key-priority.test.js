import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  HOME_DEEPSEEK_KEY_FIELD,
  HR_DEEPSEEK_KEY_FIELD,
  hydrateProcessDeepSeekKeysFromStore,
  resolveHomeDeepSeekApiKeyFromConfig,
  resolveHrDeepSeekApiKeyFromConfig
} from "../src/config/aiKeys.js";

const tempDirs = [];

async function createStoredAiEnv({
  storedHomeKey = "",
  storedHrKey = "",
  envHomeKey = "",
  envHrKey = "",
  legacyKey = ""
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), "xjg-ai-key-priority-"));
  tempDirs.push(dir);
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify(
      {
        [HOME_DEEPSEEK_KEY_FIELD]: storedHomeKey,
        [HR_DEEPSEEK_KEY_FIELD]: storedHrKey
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    AI_DATA_DIR: dir,
    DEEPSEEK_HOME_API_KEY: envHomeKey,
    DEEPSEEK_HR_API_KEY: envHrKey,
    DEEPSEEK_API_KEY: legacyKey
  };
}

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("stored scoped keys win over stale scoped env values during startup hydration", async () => {
  const envLike = await createStoredAiEnv({
    storedHomeKey: "stored-home-key",
    storedHrKey: "stored-hr-key",
    envHomeKey: "stale-home-env-key",
    envHrKey: "stale-hr-env-key",
    legacyKey: "legacy-fallback-key"
  });

  const stored = hydrateProcessDeepSeekKeysFromStore(envLike);

  assert.equal(stored.homeDeepSeekApiKey, "stored-home-key");
  assert.equal(stored.hrDeepSeekApiKey, "stored-hr-key");
  assert.equal(envLike.DEEPSEEK_HOME_API_KEY, "stored-home-key");
  assert.equal(envLike.DEEPSEEK_HR_API_KEY, "stored-hr-key");
  assert.equal(envLike.DEEPSEEK_API_KEY, "legacy-fallback-key");
});

test("home and HR runtime resolvers prefer runtime env scoped keys before saved config", () => {
  const config = {
    [HOME_DEEPSEEK_KEY_FIELD]: "stored-home-key",
    [HR_DEEPSEEK_KEY_FIELD]: "stored-hr-key"
  };
  const envLike = {
    DEEPSEEK_HOME_API_KEY: "env-home-key",
    DEEPSEEK_HR_API_KEY: "env-hr-key",
    DEEPSEEK_API_KEY: "legacy-fallback-key"
  };

  assert.equal(resolveHomeDeepSeekApiKeyFromConfig(config, envLike), "env-home-key");
  assert.equal(resolveHrDeepSeekApiKeyFromConfig(config, envLike), "env-hr-key");
});

test("home and HR runtime resolvers still fall back to env keys when saved scoped config is empty", () => {
  const config = {
    [HOME_DEEPSEEK_KEY_FIELD]: "",
    [HR_DEEPSEEK_KEY_FIELD]: ""
  };
  const envLike = {
    DEEPSEEK_HOME_API_KEY: "env-home-key",
    DEEPSEEK_HR_API_KEY: "env-hr-key",
    DEEPSEEK_API_KEY: "legacy-fallback-key"
  };

  assert.equal(resolveHomeDeepSeekApiKeyFromConfig(config, envLike), "env-home-key");
  assert.equal(resolveHrDeepSeekApiKeyFromConfig(config, envLike), "env-hr-key");
});
