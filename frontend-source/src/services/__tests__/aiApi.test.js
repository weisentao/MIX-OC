import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

import { createAiApi } from "../aiApi.js";

function createClient(responses = {}) {
  const calls = [];
  return {
    calls,
    get(url) {
      calls.push(["get", url]);
      return Promise.resolve(responses[url] || {});
    },
    post(url, payload) {
      calls.push(["post", url, payload]);
      return Promise.resolve(responses[url] || {});
    }
  };
}

describe("aiApi", () => {
  it("normalizes settings and nested config aliases without exposing key material", async () => {
    const client = createClient({
      "/workspace/ai/settings": {
        data: {
          settings: {
            enabled: "true",
            homeApiKeyConfigured: true,
            homeDeepSeekApiKey: "sk-HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
            hrDeepSeekApiKey: "sk-RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
            modelId: "deepseek-v4-pro",
            allowWebSearch: "0",
            keyStatus: { homeConfigured: true, hrConfigured: true }
          }
        }
      }
    });
    const api = createAiApi(client);

    const settings = await api.getHomeAiSettings();

    assert.deepEqual(client.calls, [["get", "/workspace/ai/settings"]]);
    assert.equal(settings.enabled, true);
    assert.equal(settings.configured, true);
    assert.equal(settings.webSearch, false);
    assert.equal(settings.modelId, "deepseek-v4-pro");
    assert.equal(settings.rawModel, "deepseek-v4-pro");
    assert.equal(settings.keyStatus.homeConfigured, true);
    assert.equal(settings.keyStatus.hrConfigured, true);
    assert.equal(settings.raw.data.settings.homeApiKeyConfigured, true);
    assert.equal(settings.raw.data.settings.homeDeepSeekApiKey, undefined);
    assert.equal(settings.raw.data.settings.hrDeepSeekApiKey, undefined);
    assert.doesNotMatch(JSON.stringify(settings), /sk-[A-Za-z0-9_-]{16,}/i);
  });

  it("posts home assistant requests only to backend home-assistant and normalizes model aliases", async () => {
    const client = createClient({
      "/workspace/ai/home-assistant": {
        answer: "ok",
        model: "deepseek-v4-flash",
        source: "deepseek",
        webSearchUsed: false,
        sources: [{ name: "Doc", content: "Summary" }]
      }
    });
    const api = createAiApi(client);

    const result = await api.askHomeAssistant({
      question: "hello",
      model: "deepseek-v4-pro",
      context: { searchResults: [{ title: "Local", text: "Visible" }] }
    });

    assert.equal(client.calls[0][0], "post");
    assert.equal(client.calls[0][1], "/workspace/ai/home-assistant");
    assert.equal(client.calls[0][2].scope, "home");
    assert.equal(client.calls[0][2].message, "hello");
    assert.equal(client.calls[0][2].model, "deepseek-v4-pro");
    assert.equal(client.calls[0][2].apiKey, undefined);
    assert.equal(result.modelId, "deepseek-v4-flash");
    assert.equal(result.rawModel, "deepseek-v4-flash");
    assert.equal(result.answer, "ok");
    assert.equal(result.sources.length, 1);
    assert.doesNotMatch(JSON.stringify(client.calls), /sk-[A-Za-z0-9_-]{16,}|api[_-]?key/i);
  });

  it("keeps DeepSeek credentials out of the AI service adapter source", async () => {
    const source = await readFile(new URL("../aiApi.js", import.meta.url), "utf8");

    assert.doesNotMatch(source, /import\.meta\.env\.[A-Z0-9_]*DEEPSEEK[A-Z0-9_]*(?:KEY|SECRET|TOKEN)/i);
    assert.doesNotMatch(source, /\bVITE_DEEPSEEK_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)\b/i);
    assert.doesNotMatch(source, /\bsk-[A-Za-z0-9_-]{16,}\b/);
    assert.doesNotMatch(source, /Authorization[\s\S]{0,80}Bearer/i);
  });
});
