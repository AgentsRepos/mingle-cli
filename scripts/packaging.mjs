import { readFile } from "node:fs/promises";

const ARCHES = ["amd64", "arm64"];

const DECLARATION = /\.d\.(ts|mts|cts)$/;

/** Basenames that belong to the official desktop package, not the CLI. */
export const GUI_BASENAMES = new Set([
  "mingle",
  "mingle.desktop",
  "mingle.png",
  "icon.png",
  "tray.png",
  "tray-attention.png",
  "tray-color.png",
  "tray-color-attention.png",
  "tray-color-stopped.png",
  "tray-stopped.png",
  ".mygo-files",
  "linux-platform-x11.node",
]);

export function normalizeRel(relPath) {
  return String(relPath).replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Decide whether a file or directory inside the official `core/` tree is
 * part of the headless CLI. `relPath` is relative to `core/`.
 * Returning false for a directory drops everything under it.
 */
export function shouldPackageCore(relPath) {
  const rel = normalizeRel(relPath);
  if (rel === "" || rel === ".") return true;
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (GUI_BASENAMES.has(base)) return false;
  if (rel.includes("linux-platform-x11") || rel.includes("pi-tui/native/linux")) return false;
  if (base.endsWith(".map")) return false;
  if (DECLARATION.test(base)) return false;
  if (/libwebkit|webkit2gtk|javascriptcore/i.test(base)) return false;
  return true;
}

/** Paths relative to a staged bundle or deb payload that must not ship. */
export function isForbiddenBundlePath(relPath) {
  const rel = normalizeRel(relPath);
  if (rel === "" || rel === ".") return false;
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (GUI_BASENAMES.has(base)) return true;
  if (rel.includes("linux-platform-x11") || rel.includes("pi-tui/native/linux")) return true;
  // node_modules trees such as @google/genai/dist/web are not the desktop GUI.
  if (/libwebkit|webkit2gtk|javascriptcore/i.test(base)) return true;
  if (base.endsWith(".map") || DECLARATION.test(base)) return true;
  return false;
}

export function parseSha256Sums(text) {
  const sums = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(\S+)$/);
    if (!match) continue;
    sums.set(match[2], match[1].toLowerCase());
  }
  return sums;
}

export async function loadUpstream(url = new URL("../upstream.json", import.meta.url)) {
  const json = JSON.parse(await readFile(url, "utf8"));
  const version = json.upstreamVersion;
  const revision = json.packagingRevision;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`upstreamVersion must look like 0.4.11, got ${version}`);
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error(`packagingRevision must be an integer >= 1, got ${revision}`);
  }
  const archives = {};
  for (const arch of ARCHES) {
    const entry = json.archives?.[arch];
    if (!entry?.filename || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error(`upstream.json archives.${arch} needs filename and sha256`);
    }
    archives[arch] = {
      filename: entry.filename,
      sha256: entry.sha256.toLowerCase(),
      url: `${json.upstreamUrl}/releases/download/v${version}/${entry.filename}`,
    };
  }
  const packagingVersion = `${version}-${revision}`;
  return {
    repo: json.upstreamRepo,
    url: json.upstreamUrl,
    version,
    revision,
    packagingVersion,
    tag: `v${packagingVersion}`,
    sumsUrl: `${json.upstreamUrl}/releases/download/v${version}/SHA256SUMS`,
    archives,
  };
}

export function hostArch() {
  if (process.arch === "x64") return "amd64";
  if (process.arch === "arm64") return "arm64";
  return null;
}

export { ARCHES };
