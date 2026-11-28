import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  isForbiddenBundlePath,
  loadUpstream,
  parseSha256Sums,
  shouldPackageCore,
} from "./packaging.mjs";

test("keeps the Node CLI payload and drops the desktop GUI", () => {
  assert.equal(shouldPackageCore("dist/cli/main.js"), true);
  assert.equal(shouldPackageCore("dist/core/mingle.js"), true);
  assert.equal(shouldPackageCore("dist/cli/manual.md"), true);
  assert.equal(shouldPackageCore("package.json"), true);
  assert.equal(shouldPackageCore("LICENSE"), true);
  assert.equal(shouldPackageCore("node_modules/hono/dist/index.js"), true);
  assert.equal(shouldPackageCore("dist/ssh-runtime.tgz"), true);
  assert.equal(shouldPackageCore("dist/web"), true);
  assert.equal(shouldPackageCore("dist/web/index.html"), true);
  assert.equal(shouldPackageCore("dist/web/assets/index.js"), true);

  assert.equal(shouldPackageCore("dist/cli/main.js.map"), false);
  assert.equal(shouldPackageCore("node_modules/pkg/index.d.ts"), false);
  assert.equal(shouldPackageCore("node_modules/pkg/index.d.mts"), false);
  assert.equal(
    shouldPackageCore("node_modules/@earendil-works/pi-tui/native/linux/prebuilds/linux-x64/linux-platform-x11.node"),
    false,
  );
  assert.equal(
    shouldPackageCore("node_modules/@earendil-works/pi-tui/native/linux/src/linux-platform-x11.c"),
    false,
  );
  assert.equal(shouldPackageCore("mingle.desktop"), false);
  assert.equal(shouldPackageCore("vendor/libwebkit2gtk-4.1.so.0"), false);
});

test("flags GUI and non-runtime files inside a staged bundle", () => {
  assert.equal(isForbiddenBundlePath("payload/dist/cli/main.js"), false);
  assert.equal(isForbiddenBundlePath("payload/dist/core/mingle.js"), false);
  assert.equal(isForbiddenBundlePath("runtime/node"), false);
  assert.equal(isForbiddenBundlePath("mingle"), true);
  assert.equal(isForbiddenBundlePath("payload/mingle.desktop"), true);
  assert.equal(isForbiddenBundlePath("payload/dist/web/index.html"), false);
  assert.equal(isForbiddenBundlePath("payload/node_modules/@google/genai/dist/web/index.mjs"), false);
  assert.equal(isForbiddenBundlePath("payload/dist/cli/main.js.map"), true);
  assert.equal(isForbiddenBundlePath("usr/share/icons/tray.png"), true);
  assert.equal(isForbiddenBundlePath("payload/node_modules/x/linux-platform-x11.node"), true);
});

test("parses GNU sha256sum lines", () => {
  const sums = parseSha256Sums(
    "abc\n" +
      "4510f31ca4816863b037a77dc5fdcda587d9db2be5946beb642c3d27babd960c  mingle-0.4.15-linux-amd64.tar.gz\n" +
      "28825c1e64d37e84c2ac5a005182bd9a5ad4c1365abe50e0fad9fe53aa1d7d06 *mingle-0.4.15-linux-arm64.tar.gz\n",
  );
  assert.equal(sums.get("mingle-0.4.15-linux-amd64.tar.gz"), "4510f31ca4816863b037a77dc5fdcda587d9db2be5946beb642c3d27babd960c");
  assert.equal(sums.get("mingle-0.4.15-linux-arm64.tar.gz"), "28825c1e64d37e84c2ac5a005182bd9a5ad4c1365abe50e0fad9fe53aa1d7d06");
  assert.equal(sums.has("abc"), false);
});

test("upstream pin describes the official release and this package revision", async () => {
  const upstream = await loadUpstream();
  assert.equal(upstream.version, "0.4.15");
  assert.equal(upstream.revision, 1);
  assert.equal(upstream.packagingVersion, "0.4.15-1");
  assert.equal(upstream.tag, "v0.4.15-1");
  assert.equal(
    upstream.sumsUrl,
    "https://github.com/earayu/Mingle/releases/download/v0.4.15/SHA256SUMS",
  );
  assert.equal(upstream.archives.amd64.filename, "mingle-0.4.15-linux-amd64.tar.gz");
  assert.equal(
    upstream.archives.amd64.url,
    "https://github.com/earayu/Mingle/releases/download/v0.4.15/mingle-0.4.15-linux-amd64.tar.gz",
  );
  assert.equal(
    upstream.archives.amd64.sha256,
    "4510f31ca4816863b037a77dc5fdcda587d9db2be5946beb642c3d27babd960c",
  );
  assert.equal(upstream.archives.arm64.filename, "mingle-0.4.15-linux-arm64.tar.gz");
  assert.equal(
    upstream.archives.arm64.url,
    "https://github.com/earayu/Mingle/releases/download/v0.4.15/mingle-0.4.15-linux-arm64.tar.gz",
  );
  assert.equal(
    upstream.archives.arm64.sha256,
    "28825c1e64d37e84c2ac5a005182bd9a5ad4c1365abe50e0fad9fe53aa1d7d06",
  );
});

test("package.json version matches the packaging version", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const upstream = await loadUpstream();
  assert.equal(pkg.version, upstream.packagingVersion);
  assert.equal(`v${pkg.version}`, upstream.tag);
});

test("launcher script passes a shell syntax check", () => {
  const result = spawnSync("sh", ["-n", new URL("../packaging/mingle-cli.sh", import.meta.url).pathname], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
