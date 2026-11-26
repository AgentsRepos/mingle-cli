#!/usr/bin/env node
// Build a headless Linux CLI and .deb from an official Mingle release archive.
// The archive is a build-time input. Nothing from it is written into git.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ARCHES,
  hostArch,
  isForbiddenBundlePath,
  loadUpstream,
  parseSha256Sums,
  shouldPackageCore,
} from "./packaging.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    arch: { type: "string", multiple: true },
    out: { type: "string", default: path.join(ROOT, "dist") },
    cache: { type: "string", default: path.join(ROOT, "build", "cache") },
  },
});

const selected = values.arch?.length ? values.arch : [hostArch()].filter(Boolean);
if (selected.length === 0 || selected.some((arch) => !ARCHES.includes(arch))) {
  console.error(`--arch must be one or more of: ${ARCHES.join(", ")}`);
  process.exit(1);
}

const upstream = await loadUpstream();
const outDir = path.resolve(values.out);
const cacheDir = path.resolve(values.cache);
await mkdir(outDir, { recursive: true });
await mkdir(cacheDir, { recursive: true });

const built = [];
for (const arch of selected) {
  built.push(await buildArch(arch));
}
await writeChecksums(outDir, built.map((item) => item.files).flat());
console.log("built:");
for (const item of built) {
  for (const file of item.files) console.log(`  ${path.relative(ROOT, file)}`);
}

async function buildArch(arch) {
  const archive = upstream.archives[arch];
  console.log(`\n== ${arch}: ${archive.filename} ==`);
  const tarball = await cachedDownload(archive.url, path.join(cacheDir, archive.filename), archive.sha256);
  const sumsText = await (await fetchOk(upstream.sumsUrl)).text();
  const published = parseSha256Sums(sumsText).get(archive.filename);
  const actual = await sha256File(tarball);
  if (actual !== archive.sha256) {
    throw new Error(`${archive.filename} sha256 ${actual} does not match upstream.json pin ${archive.sha256}`);
  }
  if (published !== archive.sha256) {
    throw new Error(`${archive.filename} published SHA256SUMS entry ${published} does not match pin ${archive.sha256}`);
  }
  console.log(`checksum ok ${actual}`);

  const work = path.join(ROOT, "build", "work", arch);
  await rm(work, { recursive: true, force: true });
  const extracted = path.join(work, "extract");
  const common = path.join(work, "common");
  await mkdir(extracted, { recursive: true });
  await run("tar", ["-xzf", tarball, "-C", extracted]);
  await stageCommon(extracted, common);
  await assertTree(common, "staged runtime");

  const bundleName = `mingle-cli-${upstream.packagingVersion}-linux-${arch}`;
  const bundleDir = path.join(work, bundleName);
  await mkdir(bundleDir, { recursive: true });
  await cp(common, bundleDir, { recursive: true });
  await copyFile(path.join(ROOT, "packaging", "mingle-cli.sh"), path.join(bundleDir, "mingle-cli"));
  await chmod(path.join(bundleDir, "mingle-cli"), 0o755);
  await copyFile(path.join(ROOT, "packaging", "mingle-cli-service.sh"), path.join(bundleDir, "mingle-cli-service"));
  await chmod(path.join(bundleDir, "mingle-cli-service"), 0o755);
  await writeBundleDocs(bundleDir, arch);

  const home = await mkdirTemp(`mingle-cli-smoke-${arch}-`);
  try {
    await smoke(bundleDir, home, arch);
  } finally {
    await rm(home, { recursive: true, force: true });
  }

  const tarPath = path.join(outDir, `${bundleName}.tar.gz`);
  await run("tar", ["-C", work, "-czf", tarPath, bundleName]);

  const debPath = path.join(outDir, `mingle-cli_${upstream.packagingVersion}_${arch}.deb`);
  await buildDeb(common, debPath, arch);
  await assertDeb(debPath, arch);

  const debHome = await mkdirTemp(`mingle-cli-deb-${arch}-`);
  const debExtract = path.join(work, "deb-extract");
  try {
    await run("dpkg-deb", ["-x", debPath, debExtract]);
    await smoke(debExtract, debHome, arch, { deb: true });
  } finally {
    await rm(debHome, { recursive: true, force: true });
  }

  return { arch, files: [tarPath, debPath] };
}

async function stageCommon(extracted, common) {
  const runtime = path.join(common, "runtime");
  const payload = path.join(common, "payload");
  await mkdir(runtime, { recursive: true });
  await copyFile(path.join(extracted, "node", "bin", "node"), path.join(runtime, "node"));
  await chmod(path.join(runtime, "node"), 0o755);
  await copyFile(path.join(extracted, "node", "LICENSE"), path.join(runtime, "LICENSE"));
  const core = path.join(extracted, "core");
  await cp(core, payload, {
    recursive: true,
    filter(src) {
      return shouldPackageCore(path.relative(core, src));
    },
  });
}

async function writeBundleDocs(bundleDir, arch) {
  const notice = bundleNotice(arch);
  await writeFile(path.join(bundleDir, "NOTICE"), notice);
  await copyFile(path.join(ROOT, "LICENSE"), path.join(bundleDir, "LICENSE"));
  await writeFile(
    path.join(bundleDir, "README.txt"),
    [
      `mingle-cli ${upstream.packagingVersion} (${arch})`,
      "",
      "Unofficial headless packaging of the Mingle Node CLI.",
      "This is not an official Mingle product.",
      `Upstream: ${upstream.url} (MIT), release v${upstream.version}.`,
      "",
      "Run:",
      "  ./mingle-cli --help",
      "  ./mingle-cli --version",
      "  ./mingle-cli start --no-open",
      "  ./mingle-cli-service env",
      "",
      "The command is mingle-cli. Upstream's help text still says mingle.",
      "mingle-cli-service is a packaging helper. systemd ExecStart calls",
      "mingle-cli-service run, which prepends common user tool paths, may set",
      "OAR_DSH_BIN, then runs mingle-cli start --no-open.",
      "mingle-cli-service start, stop, restart, and status control the user unit.",
      "start and restart print the console URL, including #token=.",
      "Data is stored in ~/.mingle (override with MINGLE_HOME).",
      "The official browser console is included. The desktop app is not.",
      "Without a display, run ./mingle-cli start --no-open and open the printed URL in a browser.",
      "See NOTICE and payload/LICENSE.",
      "",
    ].join("\n"),
  );
}

function bundleNotice(arch) {
  return [
    "mingle-cli",
    "==========",
    "",
    "Unofficial headless Linux packaging of the Mingle Node CLI.",
    "This is not an official Mingle product and it is not maintained by the Mingle authors.",
    "",
    `Upstream: ${upstream.url}`,
    `Upstream release: v${upstream.version} (${upstream.archives[arch].filename})`,
    `Packaging revision: ${upstream.packagingVersion}`,
    "Mingle is MIT licensed. See payload/LICENSE.",
    "This packaging is MIT licensed. See LICENSE.",
    "The bundled Node.js binary is the one from the official archive. See runtime/LICENSE.",
    "",
    "Excluded from the official Linux archive: the mygo/WebKit desktop entry (mingle),",
    "desktop launchers, icons, WebKit libraries, and the X11 clipboard addon.",
    "The official browser console (core/dist/web) is included.",
    "Source maps and TypeScript declaration files are omitted.",
    "",
  ].join("\n");
}

async function buildDeb(common, debPath, arch) {
  const root = path.join(path.dirname(common), "deb-root");
  await rm(root, { recursive: true, force: true });
  const lib = path.join(root, "usr", "lib", "mingle-cli");
  await mkdir(path.join(root, "usr", "bin"), { recursive: true });
  await cp(common, lib, { recursive: true });
  await copyFile(path.join(ROOT, "packaging", "mingle-cli.sh"), path.join(root, "usr", "bin", "mingle-cli"));
  await chmod(path.join(root, "usr", "bin", "mingle-cli"), 0o755);
  await copyFile(path.join(ROOT, "packaging", "mingle-cli-service.sh"), path.join(root, "usr", "bin", "mingle-cli-service"));
  await chmod(path.join(root, "usr", "bin", "mingle-cli-service"), 0o755);

  const debian = path.join(root, "DEBIAN");
  await mkdir(debian, { recursive: true });
  for (const script of ["postinst", "prerm", "postrm"]) {
    const dest = path.join(debian, script);
    await copyFile(path.join(ROOT, "packaging", "debian", script), dest);
    await chmod(dest, 0o755);
  }

  await mkdir(path.join(root, "usr", "lib", "systemd", "system"), { recursive: true });
  await mkdir(path.join(root, "usr", "lib", "systemd", "user"), { recursive: true });
  await copyFile(
    path.join(ROOT, "packaging", "systemd", "system", "mingle-cli@.service"),
    path.join(root, "usr", "lib", "systemd", "system", "mingle-cli@.service"),
  );
  await copyFile(
    path.join(ROOT, "packaging", "systemd", "user", "mingle-cli.service"),
    path.join(root, "usr", "lib", "systemd", "user", "mingle-cli.service"),
  );

  const doc = path.join(root, "usr", "share", "doc", "mingle-cli");
  await mkdir(doc, { recursive: true });
  await writeFile(path.join(doc, "NOTICE"), bundleNotice(arch));
  await copyFile(path.join(lib, "payload", "LICENSE"), path.join(doc, "MINGLE-LICENSE"));
  await copyFile(path.join(lib, "runtime", "LICENSE"), path.join(doc, "NODE-LICENSE"));
  await writeFile(path.join(doc, "copyright"), await copyrightFile());

  const installed = await duKb(path.join(root, "usr"));
  await writeFile(path.join(debian, "control"), controlFile(arch, installed));

  await rm(debPath, { force: true });
  await run("dpkg-deb", ["--root-owner-group", "--build", root, debPath]);
  console.log(`deb ${debPath}`);
}

function controlFile(arch, installedKb) {
  return [
    "Package: mingle-cli",
    `Version: ${upstream.packagingVersion}`,
    "Section: net",
    "Priority: optional",
    `Architecture: ${arch}`,
    "Maintainer: AgentsRepos Packaging <mingle-cli@users.noreply.github.com>",
    "Depends: libc6 (>= 2.17), libstdc++6, libgcc-s1, ca-certificates",
    "Suggests: systemd",
    `Installed-Size: ${installedKb}`,
    "Homepage: https://github.com/AgentsRepos/mingle-cli",
    "Description: unofficial headless Linux CLI packaging of Mingle",
    " Headless terminal packaging of the official Mingle Node CLI.",
    " This is not an official Mingle product and it does not install the",
    " desktop app. Upstream is https://github.com/earayu/Mingle (MIT).",
    " A systemd unit is included and is not enabled automatically.",
    "",
  ].join("\n");
}

async function copyrightFile() {
  const packaging = await readFile(path.join(ROOT, "LICENSE"), "utf8");
  return [
    "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/",
    "Upstream-Name: Mingle",
    "Source: https://github.com/earayu/Mingle",
    "",
    "Files: *",
    "Copyright: Mingle authors; packaging Copyright 2026 AgentsRepos",
    "License: MIT",
    " The Mingle CLI and its Node.js runtime are extracted at build time from",
    " the official Linux release archive. Mingle is MIT licensed (MINGLE-LICENSE).",
    " The Node.js binary keeps the license shipped with it (NODE-LICENSE).",
    " This packaging project is not an official Mingle product. Its own license",
    " is MIT, included below.",
    "",
    "License: MIT",
    ...packaging.trimEnd().split("\n").map((line) => (line.length ? ` ${line}` : " .")),
    "",
  ].join("\n");
}

async function assertTree(dir, label) {
  const problems = [];
  await walk(dir, async (rel) => {
    if (isForbiddenBundlePath(rel)) problems.push(rel);
  });
  const node = path.join(dir, "runtime", "node");
  const main = path.join(dir, "payload", "dist", "cli", "main.js");
  const consoleIndex = path.join(dir, "payload", "dist", "web", "index.html");
  if (!(await exists(node))) problems.push("missing runtime/node");
  if (!(await exists(main))) problems.push("missing payload/dist/cli/main.js");
  if (!(await exists(consoleIndex))) problems.push("missing payload/dist/web/index.html");
  if (problems.length) {
    throw new Error(`${label} is not headless:\n${problems.slice(0, 20).join("\n")}`);
  }
}

async function assertDeb(debPath, arch) {
  const info = await runCapture("dpkg-deb", ["-I", debPath]);
  const listing = await runCapture("dpkg-deb", ["-c", debPath]);
  if (!info.stdout.includes(`Architecture: ${arch}`)) {
    throw new Error(`deb architecture is not ${arch}:\n${info.stdout}`);
  }
  if (!/unofficial/i.test(info.stdout)) {
    throw new Error("deb description does not say this package is unofficial");
  }
  const text = listing.stdout;
  for (const required of [
    "./usr/bin/mingle-cli",
    "./usr/bin/mingle-cli-service",
    "./usr/lib/mingle-cli/runtime/node",
    "./usr/lib/mingle-cli/payload/dist/cli/main.js",
    "./usr/lib/mingle-cli/payload/dist/web/index.html",
    "./usr/lib/systemd/system/mingle-cli@.service",
    "./usr/lib/systemd/user/mingle-cli.service",
  ]) {
    if (!text.includes(required)) throw new Error(`deb is missing ${required}`);
  }
  for (const banned of ["mingle.desktop", "linux-platform-x11", "libwebkit"]) {
    if (text.includes(banned)) throw new Error(`deb contains excluded path matching ${banned}`);
  }
}

async function smoke(bundleDir, home, arch, { deb = false } = {}) {
  const runtimeNode = deb
    ? path.join(bundleDir, "usr", "lib", "mingle-cli", "runtime", "node")
    : path.join(bundleDir, "runtime", "node");
  const launcher = deb ? path.join(bundleDir, "usr", "bin", "mingle-cli") : path.join(bundleDir, "mingle-cli");
  const runner = await detectRunner(runtimeNode, arch);
  console.log(`smoke ${deb ? "deb" : "bundle"} via ${runner.label}`);

  const env = smokeEnv(home);
  const version = await runner.run(["--version"], env);
  expectOk(version, "--version");
  if (version.stdout.trim() !== upstream.version) {
    throw new Error(`--version printed ${JSON.stringify(version.stdout.trim())}, expected ${upstream.version}`);
  }
  const help = await runner.run(["--help"], env);
  expectOk(help, "--help");
  if (!help.stdout.includes("start") || !help.stdout.includes("status")) {
    throw new Error(`--help did not list CLI commands:\n${help.stdout}`);
  }
  const idle = await runner.run(["status"], env);
  const idleText = idle.stdout + idle.stderr;
  if (idle.code === 0 || !idleText.includes("mingle_not_running")) {
    throw new Error(`status before start was unexpected (${idle.code}): ${idleText}`);
  }
  assertHeadless(idleText, "status");

  const port = String(17000 + Math.floor(Math.random() * 20000));
  const started = runner.spawn(["start", "--no-open", "--port", port], env);
  try {
    await started.waitFor(/listening on http:\/\/127\.0\.0\.1:/, 90000);
    const output = redactSecrets(started.output());
    assertHeadless(output, "start");
    if (/console not built/.test(output)) {
      throw new Error("browser console was not included; payload/dist/web is required");
    }
    if (!/console: http:\/\/127\.0\.0\.1:\d+/.test(output)) {
      throw new Error(`start did not report a console URL:\n${output}`);
    }
    const status = await runner.run(["status"], env);
    expectOk(status, "status");
    assertHeadless(status.stdout + status.stderr, "status-after-start");
    const harnesses = await runner.run(["harnesses"], env);
    expectOk(harnesses, "harnesses");
    assertHeadless(harnesses.stdout + harnesses.stderr, "harnesses");
    const log = await runner.run(["log", "--lines", "20"], env);
    expectOk(log, "log");
    assertHeadless(log.stdout + log.stderr, "log");
  } finally {
    if (started.child.exitCode == null && started.child.signalCode == null) {
      started.child.kill("SIGTERM");
    }
    await started.exited.catch(() => {});
  }

  if (runner.direct) {
    const viaLauncher = await runCapture(launcher, ["--version"], { env });
    expectOk(viaLauncher, "launcher --version");
    if (viaLauncher.stdout.trim() !== upstream.version) {
      throw new Error(`launcher --version printed ${viaLauncher.stdout}`);
    }
  }
  console.log(`smoke ok (${arch}${deb ? " deb" : ""})`);
}

function smokeEnv(home) {
  const env = { ...process.env, MINGLE_HOME: home, HOME: home };
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  return env;
}

function redactSecrets(text) {
  return String(text).replace(/#token=\S+/g, "#token=[redacted]");
}

function assertHeadless(text, label) {
  if (/cannot open display|WAYLAND_DISPLAY/i.test(text)) {
    throw new Error(`${label} tried to use a display:\n${text}`);
  }
}

function expectOk(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} exited ${result.code}\n${result.stdout}\n${result.stderr}`);
  }
}

async function detectRunner(nodePath, arch) {
  const direct = await tryRun(nodePath, ["--version"]);
  if (direct.ok && direct.stdout.startsWith("v")) {
    return makeRunner(nodePath, null, "bundled node");
  }
  const qemuNames = arch === "arm64"
    ? ["qemu-aarch64-static", "qemu-aarch64"]
    : ["qemu-x86_64-static", "qemu-x86_64"];
  const sysroots = arch === "arm64" ? ["/usr/aarch64-linux-gnu"] : ["/usr/x86_64-linux-gnu"];
  const prefixes = [];
  for (const qemu of qemuNames) {
    prefixes.push([qemu]);
    for (const root of sysroots) {
      if (await exists(root)) prefixes.push([qemu, "-L", root]);
    }
  }
  let detail = direct.stderr || direct.error || "no qemu helper found";
  for (const prefix of prefixes) {
    const probe = await tryRun(prefix[0], [...prefix.slice(1), nodePath, "--version"]);
    if (probe.ok && probe.stdout.startsWith("v")) {
      return makeRunner(nodePath, prefix, prefix.join(" "));
    }
    detail = probe.stderr || probe.error || detail;
  }
  const extra = arch === "arm64" ? " and libc6-arm64-cross libstdc++6-arm64-cross" : "";
  throw new Error(
    `cannot execute ${arch} node binary (${detail.trim()}). Install qemu-user-binfmt (Ubuntu 26.04) or qemu-user-static${extra} to smoke a foreign architecture.`,
  );
}

function makeRunner(nodePath, qemuPrefix, label) {
  const command = qemuPrefix ? [...qemuPrefix, nodePath] : [nodePath];
  return {
    label,
    direct: !qemuPrefix,
    run(args, env) {
      return runCapture(command[0], [...command.slice(1), pathToCli(nodePath), ...args], { env });
    },
    spawn(args, env) {
      return spawnCollect(command[0], [...command.slice(1), pathToCli(nodePath), ...args], { env });
    },
  };
}

function pathToCli(nodePath) {
  // runtime/node -> payload/dist/cli/main.js, for both the bundle and the deb tree.
  return path.join(path.dirname(nodePath), "..", "payload", "dist", "cli", "main.js");
}

async function walk(dir, visit, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(rel, entry.name);
    await visit(child, entry);
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), visit, child);
  }
}

async function cachedDownload(url, dest, expected) {
  if (await exists(dest) && (await sha256File(dest)) === expected) {
    console.log(`cache hit ${dest}`);
    return dest;
  }
  console.log(`download ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  const partial = `${dest}.partial`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchOk(url);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      const hash = await sha256File(partial);
      if (hash !== expected) throw new Error(`downloaded sha256 ${hash}, expected ${expected}`);
      await rm(dest, { force: true });
      const { rename } = await import("node:fs/promises");
      await rename(partial, dest);
      return dest;
    } catch (error) {
      lastError = error;
      await rm(partial, { force: true });
      console.error(`download attempt ${attempt} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function fetchOk(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

async function duKb(dir) {
  const result = await runCapture("du", ["-sk", dir]);
  const kb = Number(result.stdout.trim().split(/\s+/)[0]);
  if (!Number.isFinite(kb)) throw new Error(`du failed: ${result.stdout}`);
  return kb;
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function mkdirTemp(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(tmpdir(), prefix));
}

function run(cmd, args) {
  return runCapture(cmd, args).then((result) => {
    if (result.code !== 0) {
      throw new Error(`${cmd} ${args.join(" ")} exited ${result.code}\n${result.stderr || result.stdout}`);
    }
  });
}

function runCapture(cmd, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
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

function tryRun(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
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
    child.on("error", (error) => resolve({ ok: false, stdout, stderr, error: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr, code }));
  });
}

function spawnCollect(cmd, args, { env } = {}) {
  const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  return {
    child,
    output: () => output,
    exited,
    waitFor(pattern, timeoutMs) {
      const started = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (pattern.test(output)) {
            clearInterval(timer);
            resolve();
            return;
          }
          if (child.exitCode != null || child.signalCode != null) {
            clearInterval(timer);
            reject(new Error(`process exited before ${pattern}: ${redactSecrets(output)}`));
            return;
          }
          if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`timed out waiting for ${pattern}: ${redactSecrets(output)}`));
          }
        }, 200);
      });
    },
  };
}

async function writeChecksums(dir, files) {
  const lines = [];
  for (const file of [...files].sort()) {
    lines.push(`${await sha256File(file)}  ${path.basename(file)}`);
  }
  await writeFile(path.join(dir, "SHA256SUMS"), `${lines.join("\n")}\n`);
}
