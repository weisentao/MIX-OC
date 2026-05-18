#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));

const steps = [
  {
    name: "db:check:production",
    blockedMessage: "P0_BLOCKED: production database check failed."
  },
  {
    name: "db:check:schedule",
    blockedMessage: "P0_BLOCKED: schedule schema check failed. Production launch is blocked."
  },
  {
    name: "smoke:production",
    blockedMessage: "P0_BLOCKED: core production smoke failed."
  },
  {
    name: "smoke:auth",
    blockedMessage: "P0_BLOCKED: real company user auth smoke failed."
  },
  {
    name: "smoke:auth-flows",
    blockedMessage: "P0_BLOCKED: auth register/reset/change-password smoke failed."
  },
  {
    name: "smoke:workspace",
    blockedMessage: "P0_BLOCKED: workspace bootstrap smoke failed."
  },
  {
    name: "smoke:workspace-taxonomy",
    blockedMessage: "P0_BLOCKED: workspace project-group/tag smoke failed."
  },
  {
    name: "smoke:schedule",
    blockedMessage: "P0_BLOCKED: schedule production smoke failed. Production launch is blocked."
  },
  {
    name: "smoke:schedule-library",
    blockedMessage: "P0_BLOCKED: schedule snapshot/template smoke failed. Production launch is blocked."
  },
  {
    name: "smoke:boards",
    blockedMessage: "P0_BLOCKED: board production smoke failed."
  },
  {
    name: "smoke:frontend-contract",
    blockedMessage: "P0_BLOCKED: frontend API contract smoke failed."
  },
  {
    name: "smoke:ai-deepseek",
    blockedMessage: "P0_BLOCKED: DeepSeek AI smoke failed."
  }
];

function writeCapturedOutput(output) {
  if (output.stdout) process.stdout.write(output.stdout);
  if (output.stderr) process.stderr.write(output.stderr);
}

function summarizeDbCheckFailure(output) {
  const combined = `${output.stdout || ""}\n${output.stderr || ""}`;
  const messages = [];

  if (combined.includes("FAIL_ECONNREFUSED")) {
    messages.push("P0_BLOCKED: MySQL unavailable, production launch is blocked.");
  }

  if (combined.includes("JWT_SECRET") && combined.includes("default insecure value")) {
    messages.push("P0_BLOCKED: JWT_SECRET uses insecure default value.");
  }

  if (combined.includes("FAIL_ACCESS_DENIED")) {
    messages.push("P0_BLOCKED: MySQL access denied, check MYSQL_USER/MYSQL_PASSWORD and grants.");
  }

  if (combined.includes("FAIL_UNKNOWN_DB")) {
    messages.push("P0_BLOCKED: MySQL database xjg is missing or not selected.");
  }

  if (combined.includes("FAIL_SCHEMA_MISSING")) {
    messages.push("P0_BLOCKED: MySQL schema is missing, run npm run db:prepare:production.");
  }

  if (combined.includes("FAIL_SEED_MISSING")) {
    messages.push("P0_BLOCKED: production seed is missing admin or real users.");
  }

  if (messages.length === 0) {
    messages.push("P0_BLOCKED: db:check:production failed. See docs/production-mysql-runbook.md.");
  }

  return messages;
}

function parseNodeScript(scriptName) {
  const script = String(packageJson.scripts?.[scriptName] || "").trim();
  const parts = script.split(/\s+/).filter(Boolean);
  if (parts[0] !== "node" || parts.length < 2) return null;
  return parts.slice(1);
}

function runProjectScript(scriptName) {
  console.log(`[RUN] npm run ${scriptName}`);
  const directNodeArgs = parseNodeScript(scriptName);
  const command = directNodeArgs ? process.execPath : process.platform === "win32" ? "cmd.exe" : "npm";
  const args = directNodeArgs || (process.platform === "win32" ? ["/d", "/s", "/c", `npm run ${scriptName}`] : ["run", scriptName]);
  const output = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    windowsHide: true
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

function main() {
  for (const step of steps) {
    const output = runProjectScript(step.name);

    if (output.ok) {
      console.log(`[PASS] npm run ${step.name}`);
      continue;
    }

    if (step.name === "db:check:production") {
      summarizeDbCheckFailure(output).forEach((message) => console.error(message));
    } else {
      console.error(step.blockedMessage);
    }

    console.error(`[STOP] npm run ${step.name} failed with exit code ${output.status}.`);
    process.exitCode = output.status || 1;
    return;
  }

  console.log("PRODUCTION_READY_CHECK_PASS");
}

main();
