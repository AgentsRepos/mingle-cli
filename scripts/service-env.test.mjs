import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
printf 'env XDG=%s\\n' "\${XDG_RUNTIME_DIR-}" >> "$STATE/log"
printf 'env DBUS=%s\\n' "\${DBUS_SESSION_BUS_ADDRESS-}" >> "$STATE/log"
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
printf 'XDG:%s\\n' "\${XDG_RUNTIME_DIR-}"
printf 'DBUS:%s\\n' "\${DBUS_SESSION_BUS_ADDRESS-}"
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
    assert.match(result.stdout, /^XDG:$/m);
    assert.match(result.stdout, /^DBUS:$/m);
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
    assert.equal(log.includes(`env XDG=${path.join(root, "preset-xdg")}`), true);
    assert.equal(log.includes("env DBUS=unix:path=/preset/bus"), true);
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
  assert.match(help.stdout, /XDG_RUNTIME_DIR/);
  assert.match(help.stdout, /DBUS_SESSION_BUS_ADDRESS/);
  assert.match(help.stdout, /unix:path=\$XDG_RUNTIME_DIR\/bus/);
  assert.match(help.stdout, /sudo loginctl enable-linger "\$USER"/);
  assert.match(help.stdout, /Do not run systemctl --user as root/);
});

test("start fills an empty user bus before systemctl --user", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-bus-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const home = path.join(root, "data");
    const runtimeDir = path.join(root, "run");
    await mkdir(state, { recursive: true });
    await mkdir(home, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await fakeSystemctl(bin, state);
    servers.push(await listenSocket(path.join(runtimeDir, "bus")));
    const current = await listen();
    servers.push(current.server);
    await writeFile(path.join(state, "active"), "");
    await writeFile(path.join(home, "runtime.json"), runtimeJson(current.port, "tokBUS"));
    const result = run(["start"], {
      HOME: path.join(root, "user"),
      MINGLE_HOME: home,
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), `console: http://127.0.0.1:${current.port}/#token=tokBUS`);
    const log = await readLog(state);
    assert.match(log, /^--user start mingle-cli$/m);
    assert.equal(log.includes(`env XDG=${runtimeDir}`), true);
    assert.equal(log.includes(`env DBUS=unix:path=${runtimeDir}/bus`), true);
    assert.equal(result.stderr.includes("enable-linger"), false);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("stop fills XDG_RUNTIME_DIR from the runtime directory when only the bus address is set", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-xdg-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const runtimeDir = path.join(root, "run");
    await mkdir(state, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await fakeSystemctl(bin, state);
    const result = run(["stop"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/kept/bus",
    });
    assert.equal(result.status, 0, result.stderr);
    const log = await readLog(state);
    assert.match(log, /^--user stop mingle-cli$/m);
    assert.equal(log.includes(`env XDG=${runtimeDir}`), true);
    assert.equal(log.includes("env DBUS=unix:path=/kept/bus"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("status fills DBUS_SESSION_BUS_ADDRESS from the socket when XDG_RUNTIME_DIR is already set", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-dbus-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const runtimeDir = path.join(root, "custom-runtime");
    const other = path.join(root, "other-runtime");
    await mkdir(state, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(other, { recursive: true });
    await fakeSystemctl(bin, state);
    servers.push(await listenSocket(path.join(runtimeDir, "bus")));
    servers.push(await listenSocket(path.join(other, "bus")));
    const result = run(["status"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      XDG_RUNTIME_DIR: runtimeDir,
      MINGLE_CLI_SERVICE_RUNTIME_DIR: other,
    });
    assert.equal(result.status, 3, result.stderr);
    const log = await readLog(state);
    assert.match(log, /^--user --no-pager --full status mingle-cli$/m);
    assert.equal(log.includes(`env XDG=${runtimeDir}`), true);
    assert.equal(log.includes(`env DBUS=unix:path=${runtimeDir}/bus`), true);
    assert.equal(log.includes(other), false);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("status stops before systemctl when the runtime directory is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-nodir-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const missing = path.join(root, "no-such-runtime");
    await mkdir(state, { recursive: true });
    await fakeSystemctl(bin, state);
    const result = run(["status"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: missing,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot connect to the user service bus/);
    assert.match(result.stderr, /sudo loginctl enable-linger "\$USER"/);
    assert.match(result.stderr, /sudo systemctl start user@/);
    assert.match(result.stderr, /Do not run systemctl --user as root/);
    assert.match(result.stderr, /does not enable the mingle-cli unit/);
    assert.equal(result.stderr.includes(missing), true);
    assert.equal(result.stdout.includes("console:"), false);
    assert.equal(await readLog(state), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restart stops before systemctl when the bus socket is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-nobus-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    const runtimeDir = path.join(root, "run");
    await mkdir(state, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await fakeSystemctl(bin, state);
    const result = run(["restart"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sudo loginctl enable-linger "\$USER"/);
    assert.match(result.stderr, /Do not run systemctl --user as root/);
    assert.equal(result.stderr.includes(`${runtimeDir}/bus`), true);
    assert.equal(result.stderr.includes("XDG_RUNTIME_DIR="), true);
    assert.equal(await readLog(state), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("systemctl --user is refused for root even when the bus variables are set", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-root-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    await mkdir(state, { recursive: true });
    await fakeSystemctl(bin, state);
    await writeExec(
      path.join(bin, "id"),
      `#!/bin/sh
if [ "$1" = "-u" ]; then
  printf '%s\\n' 0
  exit 0
fi
exec /usr/bin/id "$@"
`,
    );
    const result = run(["stop"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
      XDG_RUNTIME_DIR: "/run/user/0",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/0/bus",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /do not run systemctl --user as root/i);
    assert.match(result.stderr, /sudo loginctl enable-linger "\$USER"/);
    assert.match(result.stderr, /does not run enable-linger/);
    assert.equal(await readLog(state), "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the default lookup is /run/user/UID when the test runtime path is unset", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-real-"));
  try {
    const bin = path.join(root, "bin");
    const state = path.join(root, "state");
    await mkdir(state, { recursive: true });
    await fakeSystemctl(bin, state);
    const id = spawnSync("id", ["-u"], { encoding: "utf8" });
    assert.equal(id.status, 0, id.stderr);
    const uid = id.stdout.trim();
    const runtimeDir = `/run/user/${uid}`;
    const bus = `${runtimeDir}/bus`;
    const result = run(["status"], {
      HOME: path.join(root, "user"),
      PATH: `${bin}:/usr/bin:/bin`,
      STATE: state,
      LANG: "C",
    });
    const directory = await stat(runtimeDir).then((info) => info.isDirectory()).catch(() => false);
    const socket = await isSocket(bus);
    if (directory && socket) {
      assert.equal(result.status, 3, result.stderr);
      const log = await readLog(state);
      assert.equal(log.includes(`env XDG=${runtimeDir}`), true);
      assert.equal(log.includes(`env DBUS=unix:path=${bus}`), true);
    } else {
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, new RegExp(`/run/user/${uid}`));
      assert.match(result.stderr, /sudo loginctl enable-linger "\$USER"/);
      assert.match(result.stderr, /Do not run systemctl --user as root/);
      assert.equal(await readLog(state), "");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("env prints filled bus variables without changing PATH or OAR_DSH_BIN", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-envbus-"));
  const servers = [];
  try {
    const home = path.join(root, "home");
    const nodeBin = path.join(home, ".local/share/mise/installs/node/latest/bin");
    const runtimeDir = path.join(root, "run");
    const kept = path.join(root, "kept");
    await mkdir(nodeBin, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(kept, { recursive: true });
    await writeExec(path.join(nodeBin, "dsh"), "#!/bin/sh\nexit 0\n");
    servers.push(await listenSocket(path.join(runtimeDir, "bus")));
    const result = run(["env"], {
      HOME: home,
      PATH: kept,
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
    });
    assert.equal(result.status, 0, result.stderr);
    const env = fields(result.stdout);
    assert.deepEqual(env.PATH.split(":"), [nodeBin, kept]);
    assert.equal(env.OAR_DSH_BIN, path.join(nodeBin, "dsh"));
    assert.equal(env.XDG_RUNTIME_DIR, runtimeDir);
    assert.equal(env.DBUS_SESSION_BUS_ADDRESS, `unix:path=${runtimeDir}/bus`);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("env keeps preset bus variables and succeeds when the runtime directory is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-envkeep-"));
  const servers = [];
  try {
    const home = path.join(root, "home");
    const runtimeDir = path.join(root, "run");
    const missing = path.join(root, "missing");
    await mkdir(home, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    servers.push(await listenSocket(path.join(runtimeDir, "bus")));
    const kept = run(["env"], {
      HOME: home,
      PATH: "/usr/bin:/bin",
      LANG: "C",
      XDG_RUNTIME_DIR: "/already/xdg",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/already/bus",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
    });
    assert.equal(kept.status, 0, kept.stderr);
    const env = fields(kept.stdout);
    assert.equal(env.PATH, "/usr/bin:/bin");
    assert.equal(env.OAR_DSH_BIN, "");
    assert.equal(env.XDG_RUNTIME_DIR, "/already/xdg");
    assert.equal(env.DBUS_SESSION_BUS_ADDRESS, "unix:path=/already/bus");

    const absent = run(["env"], {
      HOME: home,
      PATH: "/usr/bin:/bin",
      LANG: "C",
      MINGLE_CLI_SERVICE_RUNTIME_DIR: missing,
    });
    assert.equal(absent.status, 0, absent.stderr);
    assert.equal(absent.stderr, "");
    const plain = fields(absent.stdout);
    assert.equal(plain.PATH, "/usr/bin:/bin");
    assert.equal(plain.OAR_DSH_BIN, "");
    assert.equal(Object.hasOwn(plain, "XDG_RUNTIME_DIR"), false);
    assert.equal(Object.hasOwn(plain, "DBUS_SESSION_BUS_ADDRESS"), false);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("run does not invent user bus variables when the runtime socket exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mingle-svc-runbus-"));
  const servers = [];
  try {
    const bin = path.join(root, "bin");
    const home = path.join(root, "home");
    const runtimeDir = path.join(root, "run");
    await mkdir(bin, { recursive: true });
    await mkdir(home, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await copyFile(script, path.join(bin, "mingle-cli-service"));
    await chmod(path.join(bin, "mingle-cli-service"), 0o755);
    servers.push(await listenSocket(path.join(runtimeDir, "bus")));
    await writeExec(
      path.join(bin, "mingle-cli"),
      `#!/bin/sh
printf 'XDG:%s\\n' "\${XDG_RUNTIME_DIR-}"
printf 'DBUS:%s\\n' "\${DBUS_SESSION_BUS_ADDRESS-}"
printf 'PATH:%s\\n' "$PATH"
`,
    );
    const filled = spawnSync(path.join(bin, "mingle-cli-service"), ["run"], {
      encoding: "utf8",
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        LANG: "C",
        MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
      },
    });
    assert.equal(filled.status, 0, filled.stderr);
    assert.match(filled.stdout, /^XDG:$/m);
    assert.match(filled.stdout, /^DBUS:$/m);
    assert.match(filled.stdout, /^PATH:\/usr\/bin:\/bin$/m);

    const preset = spawnSync(path.join(bin, "mingle-cli-service"), ["run"], {
      encoding: "utf8",
      env: {
        HOME: home,
        PATH: "/usr/bin:/bin",
        LANG: "C",
        MINGLE_CLI_SERVICE_RUNTIME_DIR: runtimeDir,
        XDG_RUNTIME_DIR: "/already/xdg",
        DBUS_SESSION_BUS_ADDRESS: "unix:path=/already/bus",
      },
    });
    assert.equal(preset.status, 0, preset.stderr);
    assert.match(preset.stdout, /^XDG:\/already\/xdg$/m);
    assert.match(preset.stdout, /^DBUS:unix:path=\/already\/bus$/m);
  } finally {
    await closeAll(servers);
    await rm(root, { recursive: true, force: true });
  }
});

test("readmes document the user-bus fill-in and leave the one-line install unpinned", async () => {
  for (const name of ["README.md", "README.zh-CN.md"]) {
    const text = await readFile(new URL(`../${name}`, import.meta.url), "utf8");
    assert.match(text, /XDG_RUNTIME_DIR/);
    assert.match(text, /DBUS_SESSION_BUS_ADDRESS/);
    assert.match(text, /unix:path=\$XDG_RUNTIME_DIR\/bus/);
    assert.match(text, /sudo loginctl enable-linger "\$USER"/);
    assert.match(text, /mingle-cli-service start/);
    assert.match(text, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/AgentsRepos\/mingle-cli\/main\/install\.sh \| sh/);
    assert.equal(text.includes("install.sh@v"), false);
    assert.equal(text.includes("raw.githubusercontent.com/AgentsRepos/mingle-cli/v0.4.11"), false);
  }
});

function serviceEnv(root, bin, state, home) {
  return {
    HOME: path.join(root, "user"),
    MINGLE_HOME: home,
    PATH: `${bin}:/usr/bin:/bin`,
    STATE: state,
    LANG: "C",
    // 已设置的总线变量必须原样传给 systemctl，测试机上的 /run/user 不能插手。
    XDG_RUNTIME_DIR: path.join(root, "preset-xdg"),
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/preset/bus",
  };
}

function listenSocket(file) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(file, () => resolve(server));
  });
}

async function isSocket(file) {
  try {
    return (await stat(file)).isSocket();
  } catch {
    return false;
  }
}

async function readLog(state) {
  try {
    return await readFile(path.join(state, "log"), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return "";
    throw error;
  }
}

async function closeAll(servers) {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}
