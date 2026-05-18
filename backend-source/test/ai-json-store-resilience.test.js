import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const tempDirs = [];

async function importIsolatedAiService(dataDir) {
  process.env.AI_DATA_DIR = dataDir;
  process.env.DEEPSEEK_API_KEY = "";
  process.env.DEEPSEEK_HOME_API_KEY = "";
  process.env.DEEPSEEK_HR_API_KEY = "";

  const serviceUrl = new URL("../src/modules/ai/ai.service.js", import.meta.url);
  serviceUrl.searchParams.set("jsonStoreResilience", `${Date.now()}-${Math.random()}`);
  return import(serviceUrl.href);
}

after(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("AI readiness and chat survive damaged documents and usage log JSON", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "xjg-ai-json-resilience-"));
  tempDirs.push(dataDir);
  await writeFile(
    join(dataDir, "config.json"),
    JSON.stringify({ enabled: true, homeDeepSeekApiKey: "home-json-resilience-key" }, null, 2),
    "utf8"
  );
  await writeFile(join(dataDir, "documents.json"), '{ "documents": [', "utf8");
  await writeFile(join(dataDir, "usage-logs.json"), '{ "logs": [', "utf8");

  const { chatWithAi, getWorkspaceAiAvailability } = await importIsolatedAiService(dataDir);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: "deepseek-ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
      })
  });

  try {
    const readiness = await getWorkspaceAiAvailability("home");
    assert.equal(readiness.status, "ready");
    assert.doesNotMatch(JSON.stringify(readiness), /home-json-resilience-key/);

    const response = await chatWithAi(
      { message: "ping", conversationId: "json-resilience" },
      { sub: "user-json", username: "json user", role: "employee" }
    );
    assert.equal(response.status, "success");
    assert.equal(response.source, "deepseek");

    const logs = JSON.parse(await readFile(join(dataDir, "usage-logs.json"), "utf8"));
    assert.equal(logs.logs.length, 1);
    assert.equal(logs.logs[0].status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
