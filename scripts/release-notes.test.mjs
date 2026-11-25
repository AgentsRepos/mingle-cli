import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { loadUpstream } from "./packaging.mjs";

function runNotes() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/release-notes.mjs"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("release notes include Chinese text and the online installer", async () => {
  const source = await readFile(new URL("./release-notes.mjs", import.meta.url), "utf8");
  const upstream = await loadUpstream();
  const { code, stdout, stderr } = await runNotes();
  assert.equal(code, 0, stderr);
  assert.match(source, /\$\{version\}/);
  assert.doesNotMatch(source, /mingle-cli_0\.4\.11-1_amd64\.deb/);
  assert.match(stdout, /not an official Mingle product/);
  assert.match(stdout, /不是官方 Mingle 产品/);
  assert.match(stdout, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/AgentsRepos\/mingle-cli\/main\/install\.sh \| sh/);
  assert.match(stdout, /\| sudo sh/);
  assert.match(stdout, /\| sh -s -- --download/);
  assert.match(stdout, /\/install\.sh` or `sudo \.\/install\.sh`/);
  assert.match(stdout, /sudo \.\/install\.sh`，会优先使用当前目录里校验通过的包/);
  assert.match(stdout, new RegExp(`mingle-cli_${upstream.packagingVersion}_amd64\\.deb`));
  assert.match(stdout, new RegExp(`mingle-cli-${upstream.packagingVersion}-linux-amd64\\.tar\\.gz`));
  assert.match(stdout, /The unit is not enabled automatically/);
  assert.match(stdout, /不会自动 enable/);
});
