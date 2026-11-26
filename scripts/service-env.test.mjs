import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../packaging/mingle-cli-service.sh", import.meta.url));
const userUnit = fileURLToPath(new URL("../packaging/systemd/user/mingle-cli.service", import.meta.url));
const systemUnit = fileURLToPath(new URL("../packaging/systemd/system/mingle-cli@.service", import.meta.url));

function run(args, env, timeout = 15000) {
  return spawnSync(script, args, { encoding: "utf8", env, timeout });
}

function fields(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const index = line.indexOf("=");
    assert.ok(index > 0, `expected KEY=value, got ${JSON.stringify(line)}`);
    out[line.slice(0, index)] = line.slice(index + 1);
  }
  return out;
}

async function writeExec(file, body) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, { mode: 0o755 });
  await chmod(file, 0o755);
}

function listen() {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function runtimeJson(port, token) {
  return `${JSON.stringify({ url: `http://127.0.0.1:${port}`, adminToken: token, pid: 1 })}\n`;
}

async function fakeSystemctl(binDir, stateDir) {
  await writeExec(
    path.join(binDir, "systemctl"),
    `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$STATE/log"
cmd=
for arg in "$@"; do
  case "$arg" in
    start|stop|restart|status|is-active) cmd=$arg ;;
  esac
done
case "$cmd" in
  is-active)
    if [ -f "$STATE/active" ]; then exit 0; fi
    exit 3
    ;;
  start)
    if [ -x "$STATE/on-start" ]; then "$STATE/on-start"; fi
    : > "$STATE/active"
    ;;
  stop)
    rm -f "$STATE/active"
    ;;
  restart)
    if [ -x "$STATE/on-restart" ]; then "$STATE/on-restart"; fi
    : > "$STATE/active"
    ;;
  status)
    if [ -f "$STATE/active" ]; then
      printf '%s\\n' "active (running)"
      exit 0
    fi
    printf '%s\\n' inactive
    exit 3
    ;;
  *)
    printf 'unexpected systemctl %s\\n' "$*" >&2
    exit 99
    ;;
esac
`,
  );
}

test("service helper passes a shell syntax check", () => {
  const result = spawnSync("sh", ["-n", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("units start through mingle-cli-service run", async () => {
  for (const file of [userUnit, systemUnit]) {
    const text = await readFile(file, "utf8");
    assert.match(text, /^ExecStart=\/usr\/bin\/mingle-cli-service run$/m);
  }
});

test("env prepends existing tool paths, keeps PATH, and discovers dsh", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-env-"));
  try {
    const home = path.join(root, "home");
    const shims = path.join(home, ".local/share/mise/shims");
    const nodeBin = path.join(home, ".local/share/mise/installs/node/latest/bin");
    const localBin = path.join(home, ".local/bin");
    const prefix = path.join(root, "npm-prefix");
    const prefixBin = path.join(prefix, "bin");
    const npmDir = path.join(root, "bin");
    const kept = path.join(root, "kept");
    await mkdir(shims, { recursive: true });
    await mkdir(nodeBin, { recursive: true });
    await mkdir(localBin, { recursive: true });
    await mkdir(prefixBin, { recursive: true });
    await mkdir(kept, { recursive: true });
    await writeExec(path.join(npmDir, "npm"), `#!/bin/sh\nprintf '%s\\n' '${prefix}'\n`);
    await writeExec(path.join(nodeBin, "dsh"), "#!/bin/sh\nexit 0\n");
    const result = run(["env"], { HOME: home, PATH: `${npmDir}:${kept}`, LANG: "C" });
    assert.equal(result.status, 0, result.stderr);
    const env = fields(result.stdout);
    assert.deepEqual(env.PATH.split(":"), [shims, nodeBin, localBin, prefixBin, npmDir, kept]);
    assert.equal(env.OAR_DSH_BIN, path.join(nodeBin, "dsh"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("env skips missing directories and does not overwrite OAR_DSH_BIN", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-keep-"));
  try {
    const home = path.join(root, "home");
    const nodeBin = path.join(home, ".local/share/mise/installs/node/latest/bin");
    const other = path.join(home, ".local/bin-other");
    await mkdir(nodeBin, { recursive: true });
    await mkdir(other, { recursive: true });
    await writeExec(path.join(nodeBin, "dsh"), "#!/bin/sh\nexit 0\n");
    const result = run(["env"], {
      HOME: home,
      PATH: `${other}:${nodeBin}`,
      OAR_DSH_BIN: "preset-dsh",
      LANG: "C",
    });
    assert.equal(result.status, 0, result.stderr);
    const env = fields(result.stdout);
    assert.deepEqual(env.PATH.split(":"), [nodeBin, other]);
    assert.equal(env.OAR_DSH_BIN, "preset-dsh");
    assert.equal(result.stdout.includes(`${home}/.local/share/mise/shims`), false);
    assert.equal(result.stdout.includes(`${home}/.local/bin:`), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("env uses the given HOME and can find dsh through the npm prefix", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-home-"));
  try {
    const home = path.join(root, "alice");
    const other = path.join(root, "bob/.local/bin");
    const prefix = path.join(root, "global");
    const prefixBin = path.join(prefix, "bin");
    const npmDir = path.join(root, "bin");
    await mkdir(other, { recursive: true });
    await mkdir(prefixBin, { recursive: true });
    await writeExec(path.join(npmDir, "npm"), `#!/bin/sh\nprintf 'noise\\n%s\\n' '${prefix}'\n`);
    await writeExec(path.join(prefixBin, "dsh"), "#!/bin/sh\nexit 0\n");
    const result = run(["env"], { HOME: home, PATH: npmDir, LANG: "C" });
    assert.equal(result.status, 0, result.stderr);
    const env = fields(result.stdout);
    assert.equal(env.PATH.split(":").includes(other), false);
    assert.equal(env.PATH.split(":")[0], prefixBin);
    assert.equal(env.OAR_DSH_BIN, path.join(prefixBin, "dsh"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run execs the sibling launcher with start --no-open", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-run-"));
  try {
    const bin = path.join(root, "bin");
    const home = path.join(root, "home");
    const nodeBin = path.join(home, ".local/share/mise/installs/node/latest/bin");
    await mkdir(bin, { recursive: true });
    await mkdir(nodeBin, { recursive: true });
    await copyFile(script, path.join(bin, "mingle-cli-service"));
    await chmod(path.join(bin, "mingle-cli-service"), 0o755);
    await writeExec(path.join(nodeBin, "dsh"), "#!/bin/sh\nexit 0\n");
    await writeExec(
      path.join(bin, "mingle-cli"),
      `#!/bin/sh
printf 'ARGS:%s\\n' "$*"
printf 'PATH:%s\\n' "$PATH"
printf 'OAR:%s\\n' "\${OAR_DSH_BIN-}"
`,
    );
    const result = spawnSync(path.join(bin, "mingle-cli-service"), ["run", "--port", "9"], {
      encoding: "utf8",
      env: { HOME: home, PATH: "/usr/bin:/bin", LANG: "C" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^ARGS:start --no-open --port 9$/m);
    assert.match(result.stdout, new RegExp(`^PATH:${nodeBin}:/usr/bin:/bin$`, "m"));
    assert.match(result.stdout, new RegExp(`^OAR:${path.join(nodeBin, "dsh")}$`, "m"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("start prints the console URL and does not restart a running user unit", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-start-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await fakeSystemctl(bin, state);
    const current = await listen();
    servers.push(current.server);
    await writeFile(path.join(home, "runtime.json"), runtimeJson(current.port, "tokCURRENT"));
    await writeFile(path.join(state, "active"), "");
    const env = serviceEnv(root, bin, state, home);
    const result = run(["start"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `console: http://127.0.0.1:${current.port}/#token=tokCURRENT`);
    const log = await readFile(path.join(state, "log"), "utf8");
    assert.match(log, /^--user start mingle-cli$/m);
    assert.equal(log.includes("restart"), false);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("start waits out a stale console URL from before the process listens", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-stale-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    const runtime = path.join(home, "runtime.json");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await fakeSystemctl(bin, state);
    const oldServer = await listen();
    const fresh = await listen();
    servers.push(oldServer.server, fresh.server);
    await writeFile(runtime, runtimeJson(oldServer.port, "tokOLD"));
    await writeExec(
      path.join(state, "on-start"),
      `#!/bin/sh
setsid sh -c 'sleep 0.35; printf "%s\\n" "$PAYLOAD" > "$RUNTIME"' </dev/null >/dev/null 2>&1 &
exit 0
`,
    );
    const env = {
      ...serviceEnv(root, bin, state, home),
      RUNTIME: runtime,
      PAYLOAD: runtimeJson(fresh.port, "tokNEW").trim(),
    };
    const result = run(["start"], env);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(result.stdout.trim(), `console: http://127.0.0.1:${fresh.port}/#token=tokNEW`);
    assert.equal(result.stdout.includes("tokOLD"), false);
    assert.equal(result.stderr.includes("tokOLD"), false);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("restart prints the new token after the new process is listening", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-restart-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    const runtime = path.join(home, "runtime.json");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await fakeSystemctl(bin, state);
    const oldServer = await listen();
    const fresh = await listen();
    servers.push(oldServer.server, fresh.server);
    await writeFile(runtime, runtimeJson(oldServer.port, "tokOLD"));
    await writeFile(path.join(state, "active"), "");
    await writeExec(
      path.join(state, "on-restart"),
      `#!/bin/sh
setsid sh -c 'sleep 0.35; printf "%s\\n" "$PAYLOAD" > "$RUNTIME"' </dev/null >/dev/null 2>&1 &
exit 0
`,
    );
    const env = {
      ...serviceEnv(root, bin, state, home),
      RUNTIME: runtime,
      PAYLOAD: runtimeJson(fresh.port, "tokNEW").trim(),
    };
    const result = run(["restart"], env);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.equal(result.stdout.trim(), `console: http://127.0.0.1:${fresh.port}/#token=tokNEW`);
    assert.equal(`${result.stdout}${result.stderr}`.includes("tokOLD"), false);
    const log = await readFile(path.join(state, "log"), "utf8");
    assert.match(log, /^--user restart mingle-cli$/m);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("stop stops the user unit without printing a console URL", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-stop-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await fakeSystemctl(bin, state);
    await writeFile(path.join(state, "active"), "");
    const result = run(["stop"], serviceEnv(root, bin, state, home));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.includes("console:"), false);
    const log = await readFile(path.join(state, "log"), "utf8");
    assert.match(log, /^--user stop mingle-cli$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status includes the console URL only while the user unit is active", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-status-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await fakeSystemctl(bin, state);
    const current = await listen();
    servers.push(current.server);
    await writeFile(path.join(home, "runtime.json"), runtimeJson(current.port, "tokSTATUS"));
    const env = serviceEnv(root, bin, state, home);
    const stopped = run(["status"], env);
    assert.equal(stopped.status, 3, stopped.stderr);
    assert.match(stopped.stdout, /inactive/);
    assert.equal(stopped.stdout.includes("#token="), false);

    await writeFile(path.join(state, "active"), "");
    const running = run(["status"], env);
    assert.equal(running.status, 0, running.stderr);
    assert.match(running.stdout, /active \(running\)/);
    assert.match(running.stdout, new RegExp(`console: http://127\\.0\\.0\\.1:${current.port}/#token=tokSTATUS`));
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("help lists the user-unit commands and rejects unknown commands", () => {
  const help = run(["--help"], { PATH: "/usr/bin:/bin", LANG: "C" });
  assert.equal(help.status, 0, help.stderr);
  for (const word of ["run", "env", "start", "stop", "restart", "status"]) {
    assert.match(help.stdout, new RegExp(`\\b${word}\\b`));
  }
  const unknown = run(["frob"], { PATH: "/usr/bin:/bin", LANG: "C" });
  assert.equal(unknown.status, 2);
  const bare = run([], { PATH: "/usr/bin:/bin", LANG: "C" });
  assert.equal(bare.status, 2);
});

function serviceEnv(root, bin, state, home) {
  return {
    HOME: path.join(root, "user"),
    MINGLE_HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
    STATE: state,
    LANG: "C",
  };
}

async function closeAll(servers) {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}
