#!/bin/sh
# Offline checks for install.sh. The network install is exercised separately.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install=${root}/install.sh

fail() {
  printf 'install.test: %s\n' "$1" >&2
  exit 1
}

make_uname() {
  dir=$1
  mkdir -p "$dir"
  cat > "${dir}/uname" <<'EOF'
#!/bin/sh
case "${1:-}" in
  -s) printf '%s\n' "$FAKE_OS" ;;
  -m) printf '%s\n' "$FAKE_MACHINE" ;;
  *) printf '%s\n' "$FAKE_OS" ;;
esac
EOF
  chmod 755 "${dir}/uname"
}

expect_reject() {
  label=$1
  os=$2
  machine=$3
  bin=$(mktemp -d)
  make_uname "$bin"
  set +e
  out=$(FAKE_OS="$os" FAKE_MACHINE="$machine" PATH="${bin}:${PATH}" sh "$install" 2>&1)
  code=$?
  set -e
  rm -rf "$bin"
  [ "$code" -ne 0 ] || fail "${label} exited 0: ${out}"
  printf '%s\n' "$out" | grep -q 'only Linux amd64 and arm64 are supported' || fail "${label} missing support error: ${out}"
  printf 'ok %s\n' "$label"
}

sh -n "$install"
expect_reject "darwin" Darwin x86_64
expect_reject "linux-i686" Linux i686
expect_reject "linux-armv7" Linux armv7l
printf 'install.test: ok\n'
