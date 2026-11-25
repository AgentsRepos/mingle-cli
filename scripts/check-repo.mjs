#!/usr/bin/env node
// Fail if this repository tracks Mingle source, official archives, or other
// build output. Official bytes are downloaded at build time only.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

const MAX_TRACKED_BYTES = 1_000_000;

const forbidden = [
  /(^|\/)core\/dist\//,
  /(^|\/)desktop\//,
  /(^|\/)node_modules\//,
  /(^|\/)node\/bin\/node$/,
  /(^|\/)\.mygo-files$/,
  /mingle\.desktop$/,
  /linux-platform-x11\.node$/,
  /(^|\/)mingle-[\d.]+-linux-.*\.tar\.gz$/,
  /\.deb$/,
];

const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "buffer" });
if (listed.status !== 0) {
  console.error(listed.stderr?.toString() || "git ls-files failed");
  process.exit(1);
}

const files = listed.stdout.toString("utf8").split("\0").filter(Boolean);
const problems = [];

for (const file of files) {
  if (forbidden.some((pattern) => pattern.test(file))) {
    problems.push(`${file}: tracked path is upstream source, a GUI artifact, or a built package`);
    continue;
  }
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > MAX_TRACKED_BYTES) {
    problems.push(`${file}: tracked file is ${size} bytes; do not vendor upstream archives or binaries`);
  }
}

if (problems.length > 0) {
  console.error("Repository policy check failed:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`repository policy ok (${files.length} files checked, no vendored Mingle source)`);
