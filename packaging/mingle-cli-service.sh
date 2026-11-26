#!/bin/sh
# Packaging helper installed beside mingle-cli. Not an upstream Mingle command.
#
#   run      systemd ExecStart: prepend tool paths, then exec
#            mingle-cli start --no-open with the bundled Node runtime
#   env      print the PATH and OAR_DSH_BIN that run would use
#   start    systemctl --user start, then print the console URL
#   stop     systemctl --user stop
#   restart  systemctl --user restart, then print the new console URL
#   status   systemctl --user status, plus the console URL when it is up
#   daemon-reload
#            systemctl --user daemon-reload. Does not start or enable.
#
# start、stop、restart、status、daemon-reload 在调用 systemctl --user 之前补齐空的
# XDG_RUNTIME_DIR 与 DBUS_SESSION_BUS_ADDRESS。已经设置的值不覆盖。
# 运行时目录或总线套接字不存在时只打印说明并退出，不执行 enable-linger，
# 也不 enable 单元。start、stop、restart、status 不会自动 daemon-reload。
# run 不改这两个变量，也不调用 systemctl：systemd 的 ExecStart 已带上环境。
#
# start leaves an already running user unit alone. restart waits until the
# new process is listening and its admin token differs from the previous one.
# The URL is read from $MINGLE_HOME/runtime.json, or ~/.mingle/runtime.json.
# This helper does not run `mingle open` and does not enable the unit.
set -eu

USER_UNIT=mingle-cli
WAIT_SECONDS=90

usage() {
  cat <<'EOF'
Usage: mingle-cli-service <command>

Packaging helper for the mingle-cli systemd units. This is not an
upstream Mingle command, and it does not enable the unit.

  run       prepare PATH and OAR_DSH_BIN, then run mingle-cli start --no-open
            (systemd ExecStart). Extra arguments are passed through.
  env       print the PATH and OAR_DSH_BIN that run would use
  start     start the user unit if it is stopped, then print the console URL
  stop      stop the user unit
  restart   restart the user unit, then print the new console URL
  status    show the user unit status and, when listening, the console URL
  daemon-reload
            run systemctl --user daemon-reload so the user manager reloads
            unit files that changed on disk. This does not start, stop, or
            enable the unit.
  -h, --help
            show this help

start, stop, restart, status, and daemon-reload call systemctl --user.
If XDG_RUNTIME_DIR is unset or empty and /run/user/<uid> exists, it is set
to that directory. If DBUS_SESSION_BUS_ADDRESS is unset or empty and
$XDG_RUNTIME_DIR/bus is a socket, it is set to unix:path=$XDG_RUNTIME_DIR/bus.
Values that are already set are kept. If the runtime directory or bus
socket is missing, the command stops and tells you to run:
sudo loginctl enable-linger "$USER"
Do not run systemctl --user as root. The helper does not run enable-linger
and does not enable the unit. run does not change those two variables.
start, stop, restart, and status do not run daemon-reload. After a unit
file changes on disk, run daemon-reload, then start or restart.
EOF
}

resolve_self_dir() {
  source=$0
  while [ -L "$source" ]; do
    linkdir=$(CDPATH= cd -- "$(dirname -- "$source")" && pwd)
    source=$(readlink -- "$source")
    case $source in
      /*) ;;
      *) source=$linkdir/$source ;;
    esac
  done
  CDPATH= cd -- "$(dirname -- "$source")" && pwd
}

path_contains() {
  needle=$1
  rest=$2
  [ -n "$needle" ] || return 1
  [ -n "$rest" ] || return 1
  while [ -n "$rest" ]; do
    case $rest in
      "$needle"|"$needle":*) return 0 ;;
    esac
    case $rest in
      *:*) rest=${rest#*:} ;;
      *) return 1 ;;
    esac
  done
  return 1
}

add_dir() {
  dir=$1
  [ -n "$dir" ] || return 0
  [ -d "$dir" ] || return 0
  case $dir in
    *:*) return 0 ;;
  esac
  if path_contains "$dir" "$front"; then
    return 0
  fi
  if [ -n "$front" ]; then
    front=$front:$dir
  else
    front=$dir
  fi
}

trim() {
  text=$1
  while :; do
    case $text in
      [[:space:]]*) text=${text#?} ;;
      *[[:space:]]) text=${text%?} ;;
      *) break ;;
    esac
  done
  printf '%s' "$text"
}

service_home() {
  if [ -n "${HOME:-}" ]; then
    printf '%s\n' "$HOME"
    return 0
  fi
  entry=$(getent passwd "$(id -u)" 2>/dev/null || true)
  [ -n "$entry" ] || return 1
  rest=$entry
  n=0
  while [ "$n" -lt 5 ]; do
    rest=${rest#*:}
    n=$((n + 1))
  done
  home=${rest%%:*}
  [ -n "$home" ] || return 1
  printf '%s\n' "$home"
}

prepare_service_env() {
  if [ -n "${HOME:-}" ]; then
    home=$HOME
  else
    home=$(service_home) || {
      echo "mingle-cli-service: HOME is not set for this account" >&2
      exit 1
    }
    HOME=$home
    export HOME
  fi
  case $home in
    */) home=${home%/} ;;
  esac
  [ -n "$home" ] || {
    echo "mingle-cli-service: HOME is not set for this account" >&2
    exit 1
  }

  old_path=${PATH:-}
  front=""
  add_dir "$home/.local/share/mise/shims"
  add_dir "$home/.local/share/mise/installs/node/latest/bin"
  add_dir "$home/.local/bin"

  search_path=$old_path
  if [ -n "$front" ]; then
    if [ -n "$search_path" ]; then
      search_path=$front:$search_path
    else
      search_path=$front
    fi
  fi

  npm_bin=$(PATH="$search_path" command -v npm 2>/dev/null || true)
  if [ -n "$npm_bin" ]; then
    npm_out=$(PATH="$search_path" npm config get prefix 2>/dev/null || true)
    npm_prefix=""
    while IFS= read -r line || [ -n "$line" ]; do
      line=$(trim "$line")
      [ -n "$line" ] || continue
      npm_prefix=$line
    done <<EOF
$npm_out
EOF
    case $npm_prefix in
      /*)
        case $npm_prefix in
          *[![:print:]]*|*:*) ;;
          *)
            add_dir "${npm_prefix%/}/bin"
            ;;
        esac
        ;;
    esac
  fi

  merged=$front
  saved_ifs=$IFS
  IFS=:
  set -f
  # shellcheck disable=SC2086
  for entry in $old_path; do
    if [ -n "$entry" ] && path_contains "$entry" "$front"; then
      continue
    fi
    if [ -n "$merged" ]; then
      merged=$merged:$entry
    else
      merged=$entry
    fi
  done
  set +f
  IFS=$saved_ifs
  PATH=$merged
  export PATH

  if [ -n "${OAR_DSH_BIN:-}" ]; then
    export OAR_DSH_BIN
    return 0
  fi
  found=$(command -v dsh 2>/dev/null || true)
  case $found in
    /*)
      OAR_DSH_BIN=$found
      export OAR_DSH_BIN
      ;;
  esac
}

# 测试把 MINGLE_CLI_SERVICE_RUNTIME_DIR 设成绝对路径，用来代替 /run/user/UID。
# 这不是用户配置。相对路径一律忽略。
user_runtime_candidate() {
  case ${MINGLE_CLI_SERVICE_RUNTIME_DIR:-} in
    /*)
      printf '%s\n' "$MINGLE_CLI_SERVICE_RUNTIME_DIR"
      ;;
    *)
      printf '%s\n' "/run/user/$(id -u)"
      ;;
  esac
}

# 只补空白变量。两枚变量都有值时返回 0，否则返回 1。这里不打印错误。
apply_user_bus() {
  bus_candidate=$(user_runtime_candidate)
  if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "$bus_candidate" ]; then
    XDG_RUNTIME_DIR=$bus_candidate
    export XDG_RUNTIME_DIR
  fi
  bus_runtime=${XDG_RUNTIME_DIR:-}
  if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -n "$bus_runtime" ] && [ -S "${bus_runtime}/bus" ]; then
    DBUS_SESSION_BUS_ADDRESS=unix:path=$bus_runtime/bus
    export DBUS_SESSION_BUS_ADDRESS
  fi
  [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]
}

# systemctl --user 专用。run 不调用。root 直接拒绝；目录或套接字不可用时说明下一步。
require_user_bus() {
  bus_uid=$(id -u)
  if [ "$bus_uid" -eq 0 ]; then
    cat >&2 <<'EOF'
mingle-cli-service: do not run systemctl --user as root.
A root shell has no session bus for the account that owns the user unit.
Run mingle-cli-service as that user. To keep that user's services after logout:

  sudo loginctl enable-linger "$USER"

This helper does not run enable-linger, and it does not enable the unit.
EOF
    return 1
  fi
  if apply_user_bus; then
    return 0
  fi
  bus_candidate=$(user_runtime_candidate)
  bus_runtime=${XDG_RUNTIME_DIR:-$bus_candidate}
  cat >&2 <<EOF
mingle-cli-service: cannot connect to the user service bus from this shell.
systemctl --user needs XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS.
XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-<unset>}
DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-<unset>}
The runtime directory checked was ${bus_candidate}. The bus socket checked was ${bus_runtime}/bus.
Do not run systemctl --user as root. A root shell has no session bus for your account.
Enable linger for your user, then start the user manager if the directory is still missing:

  sudo loginctl enable-linger "\$USER"
  sudo systemctl start user@${bus_uid}

This helper does not run those commands, and it does not enable the mingle-cli unit.
EOF
  return 1
}

user_systemctl() {
  command -v systemctl >/dev/null 2>&1 || {
    echo "mingle-cli-service: systemctl not found" >&2
    exit 127
  }
  require_user_bus || exit 1
  SYSTEMD_PAGER=cat systemctl --user "$@"
}

require_no_args() {
  if [ "$#" -gt 1 ]; then
    echo "mingle-cli-service: $1 takes no arguments" >&2
    usage >&2
    exit 2
  fi
}

runtime_file() {
  if [ -n "${MINGLE_HOME:-}" ]; then
    printf '%s\n' "${MINGLE_HOME%/}/runtime.json"
    return 0
  fi
  if [ -n "${HOME:-}" ]; then
    printf '%s\n' "${HOME%/}/.mingle/runtime.json"
    return 0
  fi
  return 1
}

runtime_fields() {
  rt_url=
  rt_token=
  file=$(runtime_file) || return 1
  [ -f "$file" ] || return 1
  text=$(cat "$file" 2>/dev/null || true)
  [ -n "$text" ] || return 1
  rt_url=$(printf '%s\n' "$text" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  rt_token=$(printf '%s\n' "$text" | sed -n 's/.*"adminToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$rt_url" ] && [ -n "$rt_token" ] || return 1
  case $rt_token in
    *[!A-Za-z0-9_-]*) return 1 ;;
  esac
  case $rt_url in
    http://*|https://*) ;;
    *) return 1 ;;
  esac
}

runtime_token() {
  runtime_fields || return 1
  printf '%s\n' "$rt_token"
}

parse_host_port() {
  rest=$1
  case $rest in
    http://*) rest=${rest#http://} ;;
    https://*) rest=${rest#https://} ;;
    *) return 1 ;;
  esac
  rest=${rest%%#*}
  rest=${rest%%/*}
  case $rest in
    *:*)
      rt_host=${rest%:*}
      rt_port=${rest##*:}
      ;;
    *) return 1 ;;
  esac
  case $rt_host in
    ""|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
  case $rt_port in
    ""|*[!0-9]*) return 1 ;;
  esac
}

tcp_open() {
  host=$1
  port=$2
  case $host in
    ""|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
  case $port in
    ""|*[!0-9]*) return 1 ;;
  esac
  command -v bash >/dev/null 2>&1 || return 1
  if command -v timeout >/dev/null 2>&1; then
    if MINGLE_PROBE_HOST=$host MINGLE_PROBE_PORT=$port timeout 1 bash -c 'exec 3<>"/dev/tcp/${MINGLE_PROBE_HOST}/${MINGLE_PROBE_PORT}"' >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi
  if MINGLE_PROBE_HOST=$host MINGLE_PROBE_PORT=$port bash -c 'exec 3<>"/dev/tcp/${MINGLE_PROBE_HOST}/${MINGLE_PROBE_PORT}"' >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

live_console_url() {
  runtime_fields || return 1
  parse_host_port "$rt_url" || return 1
  tcp_open "$rt_host" "$rt_port" || return 1
  base=${rt_url%/}
  printf '%s\n' "${base}/#token=${rt_token}"
}

wait_console() {
  previous=$1
  deadline=$(( $(date +%s) + WAIT_SECONDS ))
  while :; do
    if user_systemctl is-active --quiet "$USER_UNIT"; then
      url=$(live_console_url || true)
      if [ -n "$url" ]; then
        token=${url##*#token=}
        if [ -z "$previous" ] || [ "$token" != "$previous" ]; then
          printf 'console: %s\n' "$url"
          return 0
        fi
      fi
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "mingle-cli-service: timed out waiting for the console URL" >&2
      return 1
    fi
    sleep 0.2
  done
}

cmd_start() {
  was_active=0
  if user_systemctl is-active --quiet "$USER_UNIT"; then
    was_active=1
  fi
  previous=
  if [ "$was_active" -eq 0 ]; then
    previous=$(runtime_token || true)
  fi
  user_systemctl start "$USER_UNIT"
  wait_console "$previous"
}

cmd_restart() {
  previous=$(runtime_token || true)
  user_systemctl restart "$USER_UNIT"
  wait_console "$previous"
}

cmd_status() {
  set +e
  user_systemctl --no-pager --full status "$USER_UNIT"
  code=$?
  set -e
  if user_systemctl is-active --quiet "$USER_UNIT"; then
    url=$(live_console_url || true)
    if [ -n "$url" ]; then
      printf 'console: %s\n' "$url"
    fi
  fi
  exit "$code"
}

cmd_run() {
  self_dir=$1
  shift
  prepare_service_env
  launcher=$self_dir/mingle-cli
  if [ ! -x "$launcher" ]; then
    echo "mingle-cli-service: launcher not found: $launcher" >&2
    exit 127
  fi
  exec "$launcher" start --no-open "$@"
}

main() {
  cmd=${1:-}
  case $cmd in
    -h|--help|help)
      usage
      ;;
    "")
      usage >&2
      exit 2
      ;;
    env)
      require_no_args "$@"
      prepare_service_env
      # 能补上就打印。目录或套接字不存在时仍只报告 PATH 与 OAR_DSH_BIN。
      apply_user_bus || true
      printf 'PATH=%s\n' "$PATH"
      printf 'OAR_DSH_BIN=%s\n' "${OAR_DSH_BIN:-}"
      if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
        printf 'XDG_RUNTIME_DIR=%s\n' "$XDG_RUNTIME_DIR"
      fi
      if [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
        printf 'DBUS_SESSION_BUS_ADDRESS=%s\n' "$DBUS_SESSION_BUS_ADDRESS"
      fi
      ;;
    run)
      shift
      cmd_run "$(resolve_self_dir)" "$@"
      ;;
    start)
      require_no_args "$@"
      cmd_start
      ;;
    stop)
      require_no_args "$@"
      user_systemctl stop "$USER_UNIT"
      ;;
    restart)
      require_no_args "$@"
      cmd_restart
      ;;
    status)
      require_no_args "$@"
      cmd_status
      ;;
    daemon-reload)
      require_no_args "$@"
      user_systemctl daemon-reload
      ;;
    *)
      echo "mingle-cli-service: unknown command: $cmd" >&2
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
