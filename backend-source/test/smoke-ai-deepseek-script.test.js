import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("DeepSeek AI smoke script covers required workspace endpoints and result classifications", async () => {
  const text = await readFile("scripts/smoke-ai-deepseek.mjs", "utf8");

  assert.match(text, /DEEPSEEK_HR_API_KEY/);
  assert.match(text, /DEEPSEEK_HOME_API_KEY/);
  assert.match(text, /DEEPSEEK_API_KEY/);
  assert.match(text, /AUTH_FAILURE/);
  assert.match(text, /KEY_NOT_CONFIGURED/);
  assert.match(text, /NETWORK_FAILURE/);
  assert.match(text, /SUPPLIER_FAILURE/);
  assert.match(text, /NORMAL_RESPONSE/);
  assert.match(text, /\/workspace\/ai\/settings/);
  assert.match(text, /\/workspace\/ai\/chat/);
  assert.match(text, /\/workspace\/ai\/home-assistant/);
  assert.match(text, /\/workspace\/resources\/ai\/assignment-advice/);
  assert.match(text, /\/admin\/ai\/config/);
  assert.match(text, /\/admin\/ai\/models/);
  assert.match(text, /\/admin\/ai\/usage-logs/);
  assert.match(text, /\/admin\/ai\/documents/);
  assert.match(text, /classifyAdminAiResponse/);
  assert.match(text, /SMOKE_AI_REQUIRE_CODES/);
  assert.match(text, /smoke-ai-deepseek: PASSED/);
  assert.match(text, /homeConfigured/);
  assert.match(text, /hrConfigured/);
  assert.match(text, /DeepSeek\(\?: home\| HR\)\? API key is not configured/);
  assert.doesNotMatch(text, /map alias to DEEPSEEK_API_KEY/i);
  assert.doesNotMatch(text, /alias key detected/i);
});

test("DeepSeek AI smoke script has deterministic classification helpers", async () => {
  const {
    classifySettingsResponse,
    classifyChatResponse,
    classifyAssignmentAdviceResponse,
    classifyAdminAiResponse,
    classifyUnauthorizedResponse,
    RESULT_CODES
  } =
    await import("../scripts/smoke-ai-deepseek.mjs");

  assert.equal(classifyUnauthorizedResponse({ status: 401 }), RESULT_CODES.AUTH_FAILURE);
  assert.equal(classifyUnauthorizedResponse({ status: 502 }), RESULT_CODES.SUPPLIER_FAILURE);
  assert.equal(classifySettingsResponse({ status: 200, body: { configured: false } }), RESULT_CODES.KEY_NOT_CONFIGURED);
  assert.equal(classifySettingsResponse({ status: 200, body: { configured: true } }), RESULT_CODES.NORMAL_RESPONSE);
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "DeepSeek API key is not configured", configuredHint: false }
    ),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(
    classifyChatResponse({ status: 503, body: { message: "DeepSeek home API key is not configured" } }),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "DEEPSEEK_API_KEY is not configured", configuredHint: false }
    ),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "DEEPSEEK_HR_API_KEY is not configured", configuredHint: false }
    ),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "DEEPSEEK_HOME_API_KEY is not configured", configuredHint: false }
    ),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "fetch failed connect ECONNREFUSED", configuredHint: true }
    ),
    RESULT_CODES.NETWORK_FAILURE
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "fallback", source: "fallback" } },
      { failureReason: "upstream service error", configuredHint: true }
    ),
    RESULT_CODES.SUPPLIER_FAILURE
  );
  assert.equal(
    classifyChatResponse(
      { status: 200, body: { status: "success", source: "deepseek" } },
      { failureReason: "", configuredHint: true }
    ),
    RESULT_CODES.NORMAL_RESPONSE
  );
  assert.equal(classifyAssignmentAdviceResponse({ status: 200 }), RESULT_CODES.NORMAL_RESPONSE);
  assert.equal(
    classifyAssignmentAdviceResponse({ status: 503, body: { message: "DeepSeek HR API key is not configured" } }),
    RESULT_CODES.KEY_NOT_CONFIGURED
  );
  assert.equal(classifyAdminAiResponse({ status: 200 }), RESULT_CODES.NORMAL_RESPONSE);
  assert.equal(classifyAdminAiResponse({ status: 401 }), RESULT_CODES.AUTH_FAILURE);
  assert.equal(classifyAdminAiResponse({ status: 403 }), RESULT_CODES.AUTH_FAILURE);
  assert.equal(classifyAdminAiResponse({ status: 503 }), RESULT_CODES.SUPPLIER_FAILURE);
});

test("DeepSeek key source resolver supports alias env vars in priority order", async () => {
  const { resolveDeepSeekKeySource } = await import("../scripts/smoke-ai-deepseek.mjs");

  assert.equal(resolveDeepSeekKeySource({ DEEPSEEK_API_KEY: "main-key", DEEPSEEK_HOME_API_KEY: "home-key" }), "DEEPSEEK_HOME_API_KEY");
  assert.equal(resolveDeepSeekKeySource({ DEEPSEEK_HOME_API_KEY: "home-key", DEEPSEEK_HR_API_KEY: "hr-key" }), "DEEPSEEK_HOME_API_KEY");
  assert.equal(resolveDeepSeekKeySource({ DEEPSEEK_HR_API_KEY: "hr-key" }), "DEEPSEEK_HR_API_KEY");
  assert.equal(resolveDeepSeekKeySource({}), "");
});
