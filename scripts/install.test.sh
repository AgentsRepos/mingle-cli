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

work=$(mktemp -d)
bin=$(mktemp -d)
make_uname "$bin"
cat > "${bin}/sudo" <<'EOF'
#!/bin/sh
exit 1
EOF
chmod 755 "${bin}/sudo"
cat > "${bin}/curl" <<'EOF'
#!/bin/sh
out=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out=$2; shift 2 ;;
    -H) shift 2 ;;
    -fsSL) shift ;;
    http://*|https://*) url=$1; shift ;;
    *) shift ;;
  esac
done
printf '%s\n' "$url" >> "$CURL_LOG"
case "$url" in
  */releases/latest) cat "$API_BODY" ;;
  *)
    base=${url##*/}
    if [ -n "$out" ] && [ -f "${FIXTURE_DIR}/$base" ]; then
      cp "${FIXTURE_DIR}/$base" "$out"
      exit 0
    fi
    printf 'unexpected download %s\n' "$url" >&2
    exit 1
    ;;
esac
EOF
chmod 755 "${bin}/curl"

pkg_dir=${work}/pkg
mkdir -p "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/runtime" \
  "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/payload/dist/cli"
printf '%s\n' '#!/bin/sh' 'echo 0.4.11' > "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/mingle-cli"
printf 'node\n' > "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/runtime/node"
printf 'console\n' > "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/payload/dist/cli/main.js"
chmod 755 "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/mingle-cli" \
  "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64/runtime/node"
tar -C "$pkg_dir" -czf "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64.tar.gz" mingle-cli-0.4.11-1-linux-amd64
printf 'deb\n' > "$pkg_dir/mingle-cli_0.4.11-1_amd64.deb"
(
  cd "$pkg_dir"
  sha256sum mingle-cli-0.4.11-1-linux-amd64.tar.gz mingle-cli_0.4.11-1_amd64.deb > SHA256SUMS
)
api=${work}/api.json
cat > "$api" <<'EOF'
{
  "tag_name": "v0.4.11-1",
  "assets": [
    {"browser_download_url": "https://example.test/releases/download/v0.4.11-1/SHA256SUMS"},
    {"browser_download_url": "https://example.test/releases/download/v0.4.11-1/mingle-cli-0.4.11-1-linux-amd64.tar.gz"},
    {"browser_download_url": "https://example.test/releases/download/v0.4.11-1/mingle-cli_0.4.11-1_amd64.deb"}
  ]
}
EOF

local_dir=${work}/local
mkdir -p "$local_dir"
cp "$pkg_dir/SHA256SUMS" "$pkg_dir/mingle-cli-0.4.11-1-linux-amd64.tar.gz" "$local_dir/"
log=${work}/curl.log
: > "$log"
home=${work}/home
mkdir -p "$home"
(
  cd "$local_dir"
  FAKE_OS=Linux FAKE_MACHINE=x86_64 \
    API_BODY="$api" CURL_LOG="$log" FIXTURE_DIR="$pkg_dir" \
    HOME="$home" PATH="${bin}:${PATH}" \
    sh "$install"
)
grep -q 'releases/latest' "$log" || fail "local install did not ask which release is current"
if grep -q 'linux-amd64.tar.gz' "$log"; then
  fail "local install downloaded the archive: $(cat "$log")"
fi
got=$("$home/.local/bin/mingle-cli")
[ "$got" = "0.4.11" ] || fail "local launcher printed ${got}"
printf 'ok local archive\n'

dl=${work}/download
mkdir -p "$dl"
log2=${work}/curl-download.log
: > "$log2"
(
  cd "$dl"
  FAKE_OS=Linux FAKE_MACHINE=x86_64 \
    API_BODY="$api" CURL_LOG="$log2" FIXTURE_DIR="$pkg_dir" \
    PATH="${bin}:${PATH}" \
    sh "$install" --download
)
[ -f "$dl/install.sh" ] || fail "download mode did not save install.sh"
[ -f "$dl/SHA256SUMS" ] || fail "download mode did not save SHA256SUMS"
[ -f "$dl/mingle-cli-0.4.11-1-linux-amd64.tar.gz" ] || fail "download mode did not save the archive"
[ -f "$dl/mingle-cli_0.4.11-1_amd64.deb" ] || fail "download mode did not save the deb"
[ ! -e "$dl/.local" ] || fail "download mode installed files"
printf 'ok download mode\n'

rm -rf "$work" "$bin"
printf 'install.test: ok\n'
