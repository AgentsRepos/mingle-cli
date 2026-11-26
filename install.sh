#!/bin/sh
# Install the latest stable mingle-cli release.
# Linux amd64 and arm64 only. This is not an official Mingle installer.
#
#   curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sudo sh
#   ./install.sh --download
#
# The current directory is scanned first. A package that matches SHA256SUMS
# is installed without downloading it again. --download saves SHA256SUMS and
# this machine's packages only. It does not write install.sh.
# A Debian/Ubuntu machine with root installs the .deb. Otherwise the .tar.gz
# is unpacked under /usr/local (when already root) or ~/.local. The systemd
# unit is never enabled or started.
set -eu

REPO="AgentsRepos/mingle-cli"
API="https://api.github.com/repos/${REPO}/releases/latest"
INSTALL_URL="https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh"

die() {
  printf 'mingle-cli install: %s\n' "$1" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

can_system_install() {
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi
  command -v sudo >/dev/null 2>&1 || return 1
  sudo -n true >/dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

run_as_owner() {
  if [ "${use_root:-0}" -eq 1 ]; then
    run_root "$@"
  else
    "$@"
  fi
}

detect_platform() {
  os=$(uname -s)
  machine=$(uname -m)
  case "$os" in
    Linux) ;;
    *)
      die "only Linux amd64 and arm64 are supported (this system is ${os} ${machine})"
      ;;
  esac
  case "$machine" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *)
      die "only Linux amd64 and arm64 are supported (this system is Linux ${machine})"
      ;;
  esac
}

fetch_latest() {
  need curl
  api=$(curl -fsSL \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$API") || die "could not read the latest release from ${API}"
  tag=$(printf '%s\n' "$api" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$tag" ] || die "GitHub did not return a stable release. Check ${API}"
  case "$tag" in
    v*) version=${tag#v} ;;
    *) version=$tag ;;
  esac
  case "$version" in
    *[!0-9A-Za-z._-]*) die "unexpected release tag: ${tag}" ;;
  esac
}

asset_url() {
  name=$1
  printf '%s\n' "$api" | sed -n 's/.*"browser_download_url": *"\([^"]*\)".*/\1/p' |
    while IFS= read -r url; do
      base=${url##*/}
      if [ "$base" = "$name" ]; then
        printf '%s\n' "$url"
        break
      fi
    done || true
}

require_asset() {
  name=$1
  url=$(asset_url "$name")
  [ -n "$url" ] || die "latest release ${tag} has no ${name}"
  printf '%s\n' "$url"
}

checksum_of() {
  name=$1
  sums=$2
  awk -v name="$name" '
    {
      hash = $1
      fname = $2
      sub(/^\*/, "", fname)
      if (fname == name) {
        print hash
        found = 1
        exit
      }
    }
    END { if (!found) exit 1 }
  ' "$sums"
}

verify_file() {
  file=$1
  name=$2
  sums=$3
  file_matches "$file" "$name" "$sums" || die "checksum mismatch for ${name}"
  printf 'mingle-cli install: verified %s\n' "$name"
}

file_matches() {
  file=$1
  name=$2
  sums=$3
  need sha256sum
  expected=$(checksum_of "$name" "$sums" 2>/dev/null) || return 1
  actual=$(sha256sum "$file" | awk '{print $1}')
  expected=$(printf '%s' "$expected" | tr 'A-F' 'a-f')
  actual=$(printf '%s' "$actual" | tr 'A-F' 'a-f')
  [ -n "$expected" ] && [ "$expected" = "$actual" ]
}

download() {
  url=$1
  dest=$2
  curl -fsSL -o "$dest" "$url" || die "download failed: ${url}"
}

resolve_sums() {
  sums_url=$(require_asset "SHA256SUMS")
  if [ -f ./SHA256SUMS ] && checksum_of "$tar_name" ./SHA256SUMS >/dev/null 2>&1; then
    sums=./SHA256SUMS
    printf 'mingle-cli install: using local SHA256SUMS\n'
    return 0
  fi
  if [ -f ./SHA256SUMS ]; then
    printf 'mingle-cli install: local SHA256SUMS does not match %s\n' "$tag" >&2
  fi
  sums=${tmp}/SHA256SUMS
  download "$sums_url" "$sums"
  printf 'mingle-cli install: downloaded SHA256SUMS\n'
}

take_file() {
  name=$1
  url=$2
  if [ -f "./$name" ] && file_matches "./$name" "$name" "$sums"; then
    printf 'mingle-cli install: using local %s\n' "$name"
    payload=./$name
    return 0
  fi
  if [ -f "./$name" ]; then
    printf 'mingle-cli install: local %s failed verification, downloading\n' "$name" >&2
  fi
  payload=${tmp}/$name
  download "$url" "$payload"
  verify_file "$payload" "$name" "$sums"
}

save_asset() {
  name=$1
  url=$2
  if ! checksum_of "$name" "$sums" >/dev/null 2>&1; then
    printf 'mingle-cli install: %s is not listed in SHA256SUMS, skipped\n' "$name" >&2
    return 0
  fi
  if [ -f "./$name" ] && file_matches "./$name" "$name" "$sums"; then
    printf 'mingle-cli install: %s already in the current directory\n' "$name"
    return 0
  fi
  download "$url" "${tmp}/$name"
  file_matches "${tmp}/$name" "$name" "$sums" || die "checksum mismatch for ${name}"
  mv "${tmp}/$name" "./$name"
  printf 'mingle-cli install: saved %s\n' "$name"
}

parse_args() {
  download_only=0
  if [ "${MINGLE_CLI_DOWNLOAD:-}" = "1" ]; then
    download_only=1
  fi
  for arg in "$@"; do
    case "$arg" in
      --download) download_only=1 ;;
      -h|--help)
        cat <<EOF
Usage: install.sh [--download]

Install the latest stable mingle-cli release for Linux amd64 or arm64.
Files already in the current directory are used when they match SHA256SUMS.

  --download    save SHA256SUMS and this machine's .deb and .tar.gz here
  MINGLE_CLI_DOWNLOAD=1   same as --download

This is not an official Mingle installer. It does not enable systemd.
EOF
        exit 0
        ;;
      *) die "unknown argument: ${arg}" ;;
    esac
  done
}

install_deb() {
  deb=$1
  if ! run_root dpkg -i "$deb"; then
    command -v apt-get >/dev/null 2>&1 || die "dpkg -i failed and apt-get is not available to fix dependencies"
    run_root env DEBIAN_FRONTEND=noninteractive apt-get install -f -y
  fi
  printf 'mingle-cli install: installed %s with dpkg\n' "$(basename "$deb")"
  printf 'mingle-cli install: the systemd unit was not enabled or started\n'
  printf 'mingle-cli install: command: mingle-cli\n'
}

install_tree() {
  archive=$1
  prefix=$2
  extract=${tmp}/extract
  mkdir -p "$extract"
  tar -xzf "$archive" -C "$extract"
  top=
  for dir in "$extract"/*; do
    if [ -d "$dir" ]; then
      top=$dir
      break
    fi
  done
  [ -n "$top" ] || die "archive has no top-level directory"
  [ -x "$top/mingle-cli" ] || die "archive is missing the mingle-cli launcher"
  [ -x "$top/runtime/node" ] || die "archive is missing runtime/node"
  [ -f "$top/payload/dist/cli/main.js" ] || die "archive is missing payload/dist/cli/main.js"

  lib="${prefix}/lib/mingle-cli"
  bindir="${prefix}/bin"
  run_as_owner mkdir -p "$lib" "$bindir"
  run_as_owner rm -rf "${lib}/runtime" "${lib}/payload"
  run_as_owner cp -a "$top/runtime" "$top/payload" "$lib/"
  for extra in NOTICE LICENSE README.txt; do
    if [ -f "$top/$extra" ]; then
      run_as_owner cp -a "$top/$extra" "$lib/"
    fi
  done
  run_as_owner cp -a "$top/mingle-cli" "${bindir}/mingle-cli"
  if [ -e "$top/mingle-cli-service" ]; then
    run_as_owner cp -a "$top/mingle-cli-service" "${bindir}/mingle-cli-service"
  fi
  run_as_owner chmod 755 "${bindir}/mingle-cli" "${lib}/runtime/node"
  if [ -e "${bindir}/mingle-cli-service" ]; then
    run_as_owner chmod 755 "${bindir}/mingle-cli-service"
  fi

  printf 'mingle-cli install: installed %s\n' "$(basename "$archive")"
  printf 'mingle-cli install: command: %s\n' "${bindir}/mingle-cli"
  if [ -x "${bindir}/mingle-cli-service" ]; then
    printf 'mingle-cli install: service helper: %s\n' "${bindir}/mingle-cli-service"
  fi
  printf 'mingle-cli install: the systemd unit was not installed from this archive and was not started\n'
}

main() {
  parse_args "$@"
  detect_platform
  need curl
  fetch_latest
  printf 'mingle-cli install: latest stable release is %s (%s)\n' "$tag" "$arch"

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT INT TERM

  deb_name="mingle-cli_${version}_${arch}.deb"
  tar_name="mingle-cli-${version}-linux-${arch}.tar.gz"
  resolve_sums

  if [ "$download_only" -eq 1 ]; then
    if [ "$sums" != "./SHA256SUMS" ]; then
      cp "$sums" ./SHA256SUMS
      sums=./SHA256SUMS
      printf 'mingle-cli install: saved SHA256SUMS\n'
    fi
    save_asset "$deb_name" "$(require_asset "$deb_name")"
    save_asset "$tar_name" "$(require_asset "$tar_name")"
    printf 'mingle-cli install: SHA256SUMS and packages are in the current directory\n'
    return 0
  fi

  if can_system_install && command -v dpkg >/dev/null 2>&1 && checksum_of "$deb_name" "$sums" >/dev/null 2>&1; then
    take_file "$deb_name" "$(require_asset "$deb_name")"
    install_deb "$payload"
    return 0
  fi

  if can_system_install && command -v dpkg >/dev/null 2>&1; then
    printf 'mingle-cli install: %s is not listed in this release SHA256SUMS, so the checked archive will be installed instead\n' "$deb_name" >&2
  fi

  take_file "$tar_name" "$(require_asset "$tar_name")"

  if can_system_install; then
    use_root=1
    install_tree "$payload" /usr/local
    if command -v dpkg >/dev/null 2>&1; then
      printf 'mingle-cli install: archive installed under /usr/local because the .deb has no published checksum\n'
    else
      printf 'mingle-cli install: dpkg is not available, so the archive was installed under /usr/local\n'
    fi
    return 0
  fi

  [ -n "${HOME:-}" ] || die "HOME is not set; re-run as root to install system-wide: curl -fsSL ${INSTALL_URL} | sudo sh"
  use_root=0
  home_prefix=${HOME}/.local
  install_tree "$payload" "$home_prefix"
  printf 'mingle-cli install: no passwordless root access, so the .deb was not installed\n'
  printf 'mingle-cli install: a system-wide install needs: curl -fsSL %s | sudo sh\n' "$INSTALL_URL"
  case ":${PATH}:" in
    *":${home_prefix}/bin:"*) ;;
    *)
      printf 'mingle-cli install: add this to your shell profile:\n'
      printf '  export PATH="%s/bin:$PATH"\n' "$home_prefix"
      ;;
  esac
}

main "$@"
