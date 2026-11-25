# mingle-cli

English · [简体中文](README.zh-CN.md)

Unofficial headless Linux packaging of the [Mingle](https://github.com/earayu/Mingle) command-line interface. After installation, `mingle-cli` runs in a terminal with no `DISPLAY` and no Wayland session.

This repository is not an official Mingle product. It is not maintained by the Mingle authors, and it does not replace the official desktop app. Mingle itself is MIT licensed. This packaging is also MIT licensed. See [NOTICE](NOTICE) and [LICENSE](LICENSE).

## What you get

Official Mingle Linux archives ship a desktop entry (`mingle`) built with mygo and WebKitGTK. That program exits with `cannot open display` when no display is set. The same archive also contains a Node.js runtime and the Mingle CLI at `core/dist/cli/main.js`. This project downloads that official archive at build time and packages only the CLI:

| Included | Left out |
| --- | --- |
| `node/bin/node` and the Node.js license | mygo/WebKit desktop binary (`mingle`) |
| CLI program, shared JavaScript, and the npm dependencies it loads | desktop launcher, icons, tray images |
| | browser console (`core/dist/web`) |
| | X11 clipboard addon (`pi-tui/native/linux`, including `linux-platform-x11.node`) |
| | source maps and TypeScript declarations |

The packaged command is `mingle-cli`, not `mingle`, so it does not take the official desktop app's name. Upstream help text still refers to the command as `mingle`. Read those examples as `mingle-cli`.

Both **linux-amd64** and **linux-arm64** are built. Each release contains:

- a standalone archive whose executable is `mingle-cli`
- a `.deb` that installs `/usr/bin/mingle-cli` and a systemd unit
- `SHA256SUMS`

## Install

Pick the asset that matches `dpkg --print-architecture` (`amd64` or `arm64`). The version below is the current packaging revision; use the version attached to the GitHub Release you download.

### Debian package

```sh
sudo apt-get install ./mingle-cli_0.4.11-1_amd64.deb
mingle-cli --help
mingle-cli --version
```

`apt-get` installs the shared libraries the bundled Node binary needs (`libc6`, `libstdc++6`, `libgcc-s1`, `ca-certificates`). The package name is `mingle-cli`. It does not conflict with a package named `mingle`.

### Standalone archive

```sh
tar -xzf mingle-cli-0.4.11-1-linux-amd64.tar.gz
cd mingle-cli-0.4.11-1-linux-amd64
./mingle-cli --help
./mingle-cli --version
```

The archive is self-contained. You can move that directory anywhere and run `mingle-cli` from it.

Check the download before you unpack it:

```sh
sha256sum -c SHA256SUMS
```

## Usage

The program listens on `127.0.0.1` only. Data is stored in `~/.mingle`. Set `MINGLE_HOME` to use a different directory.

```sh
mingle-cli --help
mingle-cli --version
mingle-cli start --no-open          # keep this process running; do not open a browser
mingle-cli status
mingle-cli harnesses
mingle-cli log
```

`--no-open` matters on a machine that has a desktop: without it, `start` tries to open the console URL. There is no browser console in this package (`start` reports `console not built`). Chat-app commands and the local API still run. For the graphical console, use the official Mingle desktop app.

Creating an agent and connecting Telegram uses the same upstream commands. Substitute `mingle-cli` for `mingle`:

```sh
mingle-cli agent create --name Alex --harness claude --role "You help me plan trips."
echo "$TELEGRAM_BOT_TOKEN" | mingle-cli connect alex telegram
```

Upstream documents the product at <https://github.com/earayu/Mingle> and <https://mingle.build>.

## systemd

The `.deb` installs unit files and does not enable or start them. Nothing is taken over system-wide until you opt in.

Run it as your own user. The service and a shell `mingle-cli` then share `~/.mingle`:

```sh
systemctl --user daemon-reload
systemctl --user enable --now mingle-cli
systemctl --user status mingle-cli
```

User services stop at logout. To keep the process after you log out:

```sh
sudo loginctl enable-linger "$USER"
```

To run it as a system service for an existing account (not as root):

```sh
sudo systemctl enable --now mingle-cli@alice
systemctl status mingle-cli@alice
```

`alice` must be a real user. The template unit is `mingle-cli@.service`. There is no default system unit that runs as root.

The process is `mingle-cli start --no-open`. After a package upgrade, restart the service you enabled so it picks up the new files:

```sh
systemctl --user restart mingle-cli
# or
sudo systemctl restart mingle-cli@alice
```

Removing the package stops system template instances. Stop a user instance yourself first:

```sh
systemctl --user disable --now mingle-cli
```

## How this relates to official Mingle

[earayu/Mingle](https://github.com/earayu/Mingle) is the upstream project. Its Linux release is a desktop app that also carries this Node CLI. `mingle-cli` wraps that published CLI. It does not fork Mingle's source, and it does not add a separate implementation of the agent.

The build pin lives in [`upstream.json`](upstream.json). `upstreamVersion` is the official release tag without the `v`. `packagingRevision` is this repository's package revision of that release. The first packaging of upstream `0.4.11` is version `0.4.11-1`.

## No upstream source in this repository

Do not commit, copy, or vendor source code from earayu/Mingle. Official release archives are downloaded when `scripts/build.mjs` runs, verified against the `SHA256SUMS` file on that GitHub Release and against the checksums pinned in `upstream.json`, then filtered. Build output stays in `dist/` and `build/`, which git ignores.

`npm test` includes `scripts/check-repo.mjs`, which rejects tracked upstream trees, desktop files, package archives, and tracked files larger than 1 MB.

## Build

The build tool is Node.js 20 or newer. Packaging also needs `tar` and `dpkg-deb` (from `dpkg`). Smoking arm64 on an amd64 machine needs `qemu-user-static`, `libc6-arm64-cross`, and `libstdc++6-arm64-cross`.

```sh
npm test
node scripts/build.mjs --arch amd64
node scripts/build.mjs --arch arm64
npm run build:all
```

With no `--arch`, the build targets the machine you are on. A successful build prints `--help` and `--version`, checks `status` while the server is stopped, then runs `start --no-open` with `DISPLAY` and `WAYLAND_DISPLAY` unset and checks `status`, `harnesses`, and `log`.

Artifacts:

```text
dist/mingle-cli-0.4.11-1-linux-amd64.tar.gz
dist/mingle-cli_0.4.11-1_amd64.deb
dist/mingle-cli-0.4.11-1-linux-arm64.tar.gz
dist/mingle-cli_0.4.11-1_arm64.deb
dist/SHA256SUMS
```

## Release

GitHub Actions publishes those artifacts only after this workflow is on the default branch and a matching tag is pushed. Do not create the tag before `.github/workflows/release.yml` is in the commit you tag.

1. Merge the packaging change to `main`.
2. Confirm `upstream.json` names a real [earayu/Mingle release](https://github.com/earayu/Mingle/releases), and that each `sha256` is the checksum of that release's Linux tarball.
3. From that `main` commit, tag the packaging version (`upstreamVersion` + `-` + `packagingRevision`):

   ```sh
   git tag v0.4.11-1
   git push origin v0.4.11-1
   ```

4. The **Release** workflow builds linux-amd64 and linux-arm64, runs the headless smoke test, and creates a GitHub Release for that tag. It uploads both archives, both `.deb` packages, and `SHA256SUMS`.
5. A tag that does not match `upstream.json` fails before upload. Pushing the tag is the publish step. This repository does not publish a release from a pull request.

To build the artifacts without publishing, run the **Release** workflow with `workflow_dispatch`. That uploads workflow artifacts only.

To package a newer upstream release, change `upstream.json` (version, filenames, and pinned checksums), bump `packagingRevision` to `1` for the new upstream version, and tag `v<upstreamVersion>-<packagingRevision>`. To repackage the same upstream bits, increment `packagingRevision` only.

## License

- Packaging in this repository: [MIT](LICENSE), Copyright 2026 AgentsRepos.
- Mingle: MIT, Copyright the Mingle authors, <https://github.com/earayu/Mingle>. The upstream license is copied into the built archive from the official tarball. It is not vendored in git.
- Node.js: the license shipped next to the official Node binary in the Mingle archive.
