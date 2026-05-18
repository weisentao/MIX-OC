import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readRootDoc = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
const legacyPortPattern = /(^|[^0-9])3001([^0-9]|$)/;

test("launch checklist uses 13001 backend port instead of 3001", async () => {
  const text = await readRootDoc("docs/03-部署上线/第一版上线清单.md");

  assert.match(text, /13001/);
  assert.match(text, /3306/);
  assert.match(text, /15173/);
  assert.match(text, /local-stack-acceptance\.ps1/);
  assert.doesNotMatch(text, legacyPortPattern);
});

test("joint acceptance checklist documents frontend proxy to 13001", async () => {
  const text = await readRootDoc("docs/03-部署上线/联调验收清单.md");

  assert.match(text, /15173/);
  assert.match(text, /13001/);
  assert.match(text, /\/api/);
  assert.match(text, /local-stack-acceptance\.ps1/);
  assert.doesNotMatch(text, legacyPortPattern);
});

test("formal launch manual points to one-click local acceptance command", async () => {
  const text = await readRootDoc("docs/03-部署上线/正式上线操作手册.md");

  assert.match(text, /13001/);
  assert.match(text, /15173/);
  assert.match(text, /3306/);
  assert.match(text, /local-stack-acceptance\.ps1/);
});
