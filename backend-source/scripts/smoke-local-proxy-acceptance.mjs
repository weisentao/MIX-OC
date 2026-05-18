#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootDir, ".env") });
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 15173);
const FRONTEND_HOST = process.env.FRONTEND_HOST || "127.0.0.1";
const PROXY_BASE_URL = process.env.SMOKE_BASE_URL || `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
const PROXY_API_PREFIX = process.env.SMOKE_API_PREFIX || "/api";
const ROOT_MOUNTED_BASE_URL = `${PROXY_BASE_URL}${PROXY_API_PREFIX}`;
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || "admin";
const RESULT_CODES = Object.freeze({
  NORMAL_RESPONSE: "NORMAL_RESPONSE",
  VALIDATION_FAILURE: "VALIDATION_FAILURE",
  AUTH_FAILURE: "AUTH_FAILURE",
  SUPPLIER_FAILURE: "SUPPLIER_FAILURE",
  UNKNOWN_FAILURE: "UNKNOWN_FAILURE"
});

const steps = [
  {
    name: "smoke:auth-flows",
    env: {
      SMOKE_BASE_URL: ROOT_MOUNTED_BASE_URL
    },
    blockedMessage: "P0_BLOCKED: frontend proxy auth/register/reset/change-password smoke failed."
  },
  {
    name: "smoke:frontend-contract",
    env: {
      SMOKE_BASE_URL: PROXY_BASE_URL,
      SMOKE_API_PREFIX: PROXY_API_PREFIX
    },
    blockedMessage:
      "P0_BLOCKED: frontend proxy contract smoke failed for login/project/task/schedule/board/hr/AI/admin flows."
  },
  {
    name: "smoke:ai-deepseek",
    env: {
      SMOKE_BASE_URL: PROXY_BASE_URL,
      SMOKE_API_PREFIX: PROXY_API_PREFIX
    },
    blockedMessage: "P0_BLOCKED: frontend proxy DeepSeek AI smoke failed."
  }
];

async function requestJson(path, options = {}) {
  const response = await fetch(`${ROOT_MOUNTED_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  return {
    status: response.status,
    body,
    raw
  };
}

function bodyMessage(response = {}) {
  return typeof response.body === "object" && response.body
    ? response.body.message || response.body.error || ""
    : response.raw || "";
}

function classifyWriteResponse(response = {}) {
  if (response.status === 401 || response.status === 403) return RESULT_CODES.AUTH_FAILURE;
  if (response.status >= 200 && response.status < 300) return RESULT_CODES.NORMAL_RESPONSE;
  if (response.status === 400 || response.status === 409 || response.status === 422) return RESULT_CODES.VALIDATION_FAILURE;
  if (response.status >= 500) return RESULT_CODES.SUPPLIER_FAILURE;
  return RESULT_CODES.UNKNOWN_FAILURE;
}

async function loginAdmin() {
  const response = await requestJson("/login", {
    method: "POST",
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASS
    })
  });

  if (response.status !== 200 || !response.body?.token) {
    throw new Error(`proxy admin login failed: status=${response.status}, body=${bodyMessage(response) || "empty"}`);
  }

  console.log(`[PASS] proxy admin login via ${ROOT_MOUNTED_BASE_URL}/login`);
  return response.body.token;
}

async function assertProxyEndpoint(label, path, token, predicate) {
  const response = await requestJson(path, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!predicate(response)) {
    throw new Error(`${label} failed: status=${response.status}, body=${bodyMessage(response) || "empty"}`);
  }

  console.log(`[PASS] ${label}`);
}

async function assertWriteClassification({ label, path, token, method, body, expectedCode, predicate }) {
  const response = await requestJson(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const code = classifyWriteResponse(response);

  if (code !== expectedCode || !predicate(response)) {
    throw new Error(`${label} failed: expected=${expectedCode}, actual=${code}, status=${response.status}, body=${bodyMessage(response) || "empty"}`);
  }

  console.log(`[PASS] ${label} => ${code}`);
}

function parseNodeScript(scriptName) {
  const script = String(packageJson.scripts?.[scriptName] || "").trim();
  const parts = script.split(/\s+/).filter(Boolean);
  if (parts[0] !== "node" || parts.length < 2) return null;
  return parts.slice(1);
}

function writeCapturedOutput(output) {
  if (output.stdout) process.stdout.write(output.stdout);
  if (output.stderr) process.stderr.write(output.stderr);
}

function runProjectScript(step) {
  console.log(`[RUN] npm run ${step.name} via ${PROXY_BASE_URL}${PROXY_API_PREFIX}`);
  const directNodeArgs = parseNodeScript(step.name);
  const command = directNodeArgs ? process.execPath : process.platform === "win32" ? "cmd.exe" : "npm";
  const args = directNodeArgs || (process.platform === "win32" ? ["/d", "/s", "/c", `npm run ${step.name}`] : ["run", step.name]);
  const output = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      ...(step.env || {})
    }
  });

  writeCapturedOutput(output);

  if (output.error) {
    return {
      ok: false,
      status: 1,
      stdout: output.stdout || "",
      stderr: `${output.stderr || ""}\n${output.error.message}`.trim()
    };
  }

  return {
    ok: output.status === 0,
    status: output.status ?? 1,
    stdout: output.stdout || "",
    stderr: output.stderr || ""
  };
}

async function main() {
  console.log(`Local proxy smoke target: ${ROOT_MOUNTED_BASE_URL}`);
  for (const step of steps) {
    const output = runProjectScript(step);
    if (output.ok) {
      console.log(`[PASS] npm run ${step.name}`);
      continue;
    }

    console.error(step.blockedMessage);
    console.error(`[STOP] npm run ${step.name} failed with exit code ${output.status}.`);
    process.exitCode = output.status || 1;
    return;
  }

  const token = await loginAdmin();
  await assertProxyEndpoint(
    "proxy admin dashboard",
    "/admin/dashboard",
    token,
    (response) => response.status === 200 && response.body && typeof response.body === "object"
  );
  await assertProxyEndpoint(
    "proxy admin users",
    "/admin/users",
    token,
    (response) =>
      response.status === 200 &&
      (Array.isArray(response.body) || (response.body && typeof response.body === "object"))
  );
  await assertProxyEndpoint(
    "proxy manager overview",
    "/manager/overview",
    token,
    (response) => response.status === 200 && response.body && typeof response.body === "object"
  );
  await assertProxyEndpoint(
    "proxy manager accounts",
    "/manager/accounts",
    token,
    (response) => response.status === 200 && Array.isArray(response.body)
  );
  await assertWriteClassification({
    label: "proxy admin AI config write",
    path: "/admin/ai/config",
    token,
    method: "PATCH",
    body: {
      enabled: true,
      modelId: "deepseek-v4-flash",
      webSearchEnabled: false,
      knowledgeScopes: ["tasks"],
      openingTemplate: "proxy smoke admin write"
    },
    expectedCode: RESULT_CODES.NORMAL_RESPONSE,
    predicate: (response) => response.status === 200 && response.body && typeof response.body === "object"
  });
  await assertWriteClassification({
    label: "proxy admin AI config sensitive key rejected",
    path: "/admin/ai/config",
    token,
    method: "PATCH",
    body: {
      apiKey: "placeholder-do-not-write-real-key"
    },
    expectedCode: RESULT_CODES.VALIDATION_FAILURE,
    predicate: (response) => response.status === 400
  });
  await assertWriteClassification({
    label: "proxy manager member role write",
    path: "/manager/projects/proxy-smoke-project/members/proxy-smoke-user",
    token,
    method: "PATCH",
    body: {
      role: "editor"
    },
    expectedCode: RESULT_CODES.NORMAL_RESPONSE,
    predicate: (response) => response.status === 200 && response.body?.pendingAdminReview === true
  });
  await assertWriteClassification({
    label: "proxy manager member role invalid admin rejected",
    path: "/manager/projects/proxy-smoke-project/members/proxy-smoke-user",
    token,
    method: "PATCH",
    body: {
      role: "admin"
    },
    expectedCode: RESULT_CODES.VALIDATION_FAILURE,
    predicate: (response) => response.status === 400
  });

  console.log("LOCAL_PROXY_ACCEPTANCE_PASS");
}

main().catch((error) => {
  console.error(`[FAIL] smoke-local-proxy-acceptance runtime error - ${error.stack || error.message}`);
  process.exitCode = 1;
});
