# mingle-cli

<p align="center">
  <img src="icon.png" width="128" alt="Official Mingle icon">
</p>

English · [简体中文](README.zh-CN.md)

The picture above is the official Mingle icon, used here so the package is recognizable. This repository is still an unofficial packaging project.

Unofficial headless Linux packaging of the [Mingle](https://github.com/earayu/Mingle) command-line interface. After installation, `mingle-cli` runs in a terminal with no `DISPLAY` and no Wayland session.

This repository is not an official Mingle product. It is not maintained by the Mingle authors, and it does not replace the official desktop app. Mingle itself is MIT licensed. This packaging is also MIT licensed. See [NOTICE](NOTICE) and [LICENSE](LICENSE).

## What you get

Official Mingle Linux archives ship a desktop entry (`mingle`) built with mygo and WebKitGTK. That program exits with `cannot open display` when no display is set. The same archive also contains a Node.js runtime and the Mingle CLI at `core/dist/cli/main.js`. This project downloads that official archive at build time and packages only the CLI:

| Included | Left out |
| --- | --- |
| `node/bin/node` and the Node.js license | mygo/WebKit desktop binary (`mingle`) |
| CLI program, shared JavaScript, and the npm dependencies it loads | desktop launcher, icons, tray images |
| official browser console (`core/dist/web`) | X11 clipboard addon (`pi-tui/native/linux`, including `linux-platform-x11.node`) |
| | source maps and TypeScript declarations |

The packaged command is `mingle-cli`, not `mingle`, so it does not take the official desktop app's name. Upstream help text still refers to the command as `mingle`. Read those examples as `mingle-cli`.

Both **linux-amd64** and **linux-arm64** are built. Each release contains:

- a standalone archive whose executable is `mingle-cli`
- a `.deb` that installs `/usr/bin/mingle-cli`, `/usr/bin/mingle-cli-service`, and systemd units
- `SHA256SUMS`

## Install

### One-line install

Linux amd64 and arm64 only. [`install.sh`](install.sh) asks the GitHub API for this repository's latest stable release, checks the download against that release's `SHA256SUMS`, and installs it. It does not enable or start systemd. The script is not pinned to a packaging revision; it installs whichever stable release is current. Other operating systems and CPU architectures stop with an error.

The script looks in the current directory first. `curl | sh` uses the directory where you run it, and `./install.sh` uses that same directory. If `SHA256SUMS` and the matching package are already there and the checksum matches, those local files are installed and not downloaded again.

```sh
curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sh
```

On Debian or Ubuntu, run it as root. The latest stable release's `SHA256SUMS` lists the `.tar.gz` archives and the `.deb` packages, so this installs the `.deb` with `dpkg` and the command is `mingle-cli`. The package also installs `/usr/bin/mingle-cli-service`. User and system units call `mingle-cli-service run`. From your own session, `mingle-cli-service start`, `stop`, `restart`, and `status` control the user unit. The package's postinst reloads systemd and does not enable or start the service. Details are in [systemd](#systemd).

```sh
curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sudo sh
```

Without root, the same command installs the `.tar.gz` under `~/.local` and tells you to add `~/.local/bin` to `PATH` if it is missing. A root install on a system without `dpkg` unpacks the archive into `/usr/local`.

To save this machine's packages and `SHA256SUMS` in the current directory without installing them, run the installer you already have:

```sh
./install.sh --download
```

`MINGLE_CLI_DOWNLOAD=1 ./install.sh` is the same switch. It does not download or rewrite `install.sh`. After that, `./install.sh` or `sudo ./install.sh` in that directory reuses the saved files.

### Download a release asset

Pick the asset that matches `dpkg --print-architecture` (`amd64` or `arm64`). The version below is an example from the current packaging revision; use the version attached to the GitHub Release you download.

### Debian package

```sh
sudo apt-get install ./mingle-cli_0.4.11-2_amd64.deb
mingle-cli --help
mingle-cli --version
```

`apt-get` installs the shared libraries the bundled Node binary needs (`libc6`, `libstdc++6`, `libgcc-s1`, `ca-certificates`). The package name is `mingle-cli`. It does not conflict with a package named `mingle`.

### Standalone archive

```sh
tar -xzf mingle-cli-0.4.11-2-linux-amd64.tar.gz
cd mingle-cli-0.4.11-2-linux-amd64
./mingle-cli --help
./mingle-cli --version
```

The archive is self-contained. You can move that directory anywhere and run `mingle-cli` from it. `mingle-cli-service` is next to `mingle-cli`. The systemd unit files come with the `.deb`.

Check the download before you unpack it:

```sh
sha256sum -c SHA256SUMS
```

## Usage

The program listens on `127.0.0.1` only. Data is stored in `~/.mingle`. Set `MINGLE_HOME` to use a different directory. The command reference, taken from this package's `mingle-cli --help` and the usage lines the CLI prints, is in [docs/cli.md](docs/cli.md).

### Reach it from another machine

Official Mingle v0.4.11 binds the API to `127.0.0.1`. `mingle-cli start` only accepts `--port` and `--no-open`. There is no `--host` flag and no option to bind `0.0.0.0`. This packaging does not change that upstream behavior and does not require a new release for it.

`mingle-cli` already occupies `127.0.0.1:7419`, so do not bind a forwarder to port `7419` on the same machine. `0.0.0.0:7419` conflicts with that listener. Install `socat`, then on the machine that runs Mingle use a different public port:

```sh
socat TCP-LISTEN:7420,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:7419
```

From another machine, open `http://<this machine's address>:7420`.

That publishes the local API on the network. Use it only on a trusted network, and limit the port with a firewall.

SSH local forwarding keeps the API off the LAN. On the other machine:

```sh
ssh -N -L 7419:127.0.0.1:7419 user@mingle-host
```

Then open `http://127.0.0.1:7419` on that machine.

```sh
mingle-cli --help
mingle-cli --version
mingle-cli start --no-open          # keep this process running; do not open a browser
mingle-cli status
mingle-cli harnesses
mingle-cli log
```

`--no-open` matters on a machine that has no display, and also on a desktop if you do not want `start` to launch a browser. The official web console is included. With `--no-open`, open the printed `http://127.0.0.1:...` address yourself (or the forwarded address from the section above). The desktop app is not included.

Creating an agent and connecting Telegram uses the same upstream commands. Substitute `mingle-cli` for `mingle`:

```sh
mingle-cli agent create --name Alex --harness claude --role "You help me plan trips."
echo "$TELEGRAM_BOT_TOKEN" | mingle-cli connect alex telegram
```

Upstream documents the product at <https://github.com/earayu/Mingle> and <https://mingle.build>.

## systemd

The `.deb` installs unit files and does not enable or start them. Nothing is taken over system-wide until you opt in.

Run it as your own user. The service and a shell `mingle-cli` then share `~/.mingle`. `systemctl --user` talks to that user's session bus. Do not run `systemctl --user` as root: a root shell has no session bus for the account.

The shell needs `$XDG_RUNTIME_DIR` and `$DBUS_SESSION_BUS_ADDRESS`. A full login sets both. They stay unset when SSH did not open a full login session, or when the shell was switched to another user with `su` or `sudo`. `systemctl --user daemon-reload` then fails:

```
Failed to connect to user scope bus via local transport: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined (consider using --machine=<user>@.host --user to connect to bus of other user)
```

The current shell is not connected to the user session. This is not a Debian 13 `systemctl` failure.

User services stop at logout. Linger keeps this user's service manager running after logout. `loginctl enable-linger` needs root. Without `sudo`, logind tries to ask for a password through `/usr/bin/pkttyagent`, and a minimal Debian install often does not include that program:

```
Failed to execute /usr/bin/pkttyagent: 没有那个文件或目录
Could not enable linger: Access denied
```

This sequence works on Debian 13 over SSH:

```sh
sudo loginctl enable-linger "$USER"
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload
systemctl --user enable --now mingle-cli
```

If `/run/user/$(id -u)` does not exist yet, run `sudo systemctl start user@$(id -u)` first, or log out and SSH in again, then run the last three lines.

```sh
systemctl --user status mingle-cli
```

To run it as a system service for an existing account (not as root):

```sh
sudo systemctl enable --now mingle-cli@alice
systemctl status mingle-cli@alice
```

`alice` must be a real user. The template unit is `mingle-cli@.service`. There is no default system unit that runs as root.

Both units start through `/usr/bin/mingle-cli-service run`. That helper is part of this package. It is not an upstream Mingle command. `run` prepends directories that exist under the service account's home, then keeps the rest of `PATH`. It runs the bundled Node CLI as `mingle-cli start --no-open`.

The directories are:

- `$HOME/.local/share/mise/shims`
- `$HOME/.local/share/mise/installs/node/latest/bin`
- `$HOME/.local/bin`
- `$PREFIX/bin`, when `npm` can be resolved on that `PATH` and `npm config get prefix` prints an absolute prefix whose `bin` directory exists

A user service uses that user's home. `mingle-cli@alice` uses alice's home, because the template sets `User=%i` and systemd sets `HOME` for that account. The helper runs in the service process, so linger at boot is enough. It reads that home itself. It does not read a login shell or `~/.bashrc`, and it does not use `systemctl import-environment`. A unit's `Environment=` line does not expand `$(which dsh)`.

Mingle treats the DeepSeek Harness as installed when `dsh` is on `PATH`, or when `OAR_DSH_BIN` points at it. If `OAR_DSH_BIN` is unset or empty and `dsh` is on the augmented `PATH`, `run` exports that path. A value that is already set stays as it is, so a drop-in still wins. Use a literal path:

```ini
# ~/.config/systemd/user/mingle-cli.service.d/dsh.conf
# or /etc/systemd/system/mingle-cli@alice.service.d/dsh.conf
[Service]
Environment=OAR_DSH_BIN=/home/alice/.local/share/mise/installs/node/latest/bin/dsh
```

Reload and restart the service you enabled after adding that file.

From a shell that can already reach `systemctl --user` (the `XDG_RUNTIME_DIR` steps above), the same helper controls the user unit:

```sh
mingle-cli-service start
mingle-cli-service stop
mingle-cli-service restart
mingle-cli-service status
```

`start` starts the user unit. When the unit is already running, it leaves that process in place. It waits until the process is listening, then prints the console URL in this terminal, including `#token=`. If the unit was already running, that line is the current URL. `restart` restarts the unit and waits until the new process is listening, then prints the new URL. The token in that line is the one created by the new process. `stop` stops the user unit. `status` shows `systemctl --user status` and, when the console is listening, the same URL.

These commands do not enable the unit. They do not run `mingle open`, and they do not need a display. The URL is taken from `~/.mingle/runtime.json`, or from `$MINGLE_HOME/runtime.json` when `MINGLE_HOME` is set. It is printed only after that port accepts a connection. Set `MINGLE_HOME` in a unit drop-in as well when the service should use the same directory.

`mingle-cli-service env` prints the `PATH` and `OAR_DSH_BIN` that `run` would use in the current process. A login shell usually has a broader `PATH` than a service. To see the service view:

```sh
env -i HOME="$HOME" USER="$USER" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  mingle-cli-service env
```

The system template is still controlled with `sudo systemctl`, for example `sudo systemctl restart mingle-cli@alice`. `mingle-cli-service start` talks to the user unit only.

After a package upgrade, restart the service you enabled so it picks up the new files. For the user unit, this also prints the new console URL:

```sh
mingle-cli-service restart
# or, for the system template:
sudo systemctl restart mingle-cli@alice
```

Removing the package stops system template instances. Stop a user instance yourself first:

```sh
systemctl --user disable --now mingle-cli
```

## How this relates to official Mingle

[earayu/Mingle](https://github.com/earayu/Mingle) is the upstream project. Its Linux release is a desktop app that also carries this Node CLI. `mingle-cli` wraps that published CLI. It does not fork Mingle's source, and it does not add a separate implementation of the agent.

The build pin lives in [`upstream.json`](upstream.json). `upstreamVersion` is the official release tag without the `v`. `packagingRevision` is this repository's package revision of that release. The first packaging of upstream `0.4.11` is version `0.4.11-1`. The current packaging revision is `0.4.11-2`.

## No upstream source in this repository

Do not commit, copy, or vendor source code from earayu/Mingle. Official release archives are downloaded when `scripts/build.mjs` runs, verified against the `SHA256SUMS` file on that GitHub Release and against the checksums pinned in `upstream.json`, then filtered. Build output stays in `dist/` and `build/`, which git ignores.

`npm test` includes `scripts/check-repo.mjs`, which rejects tracked upstream trees, desktop files, package archives, and tracked files larger than 1 MB.

## Build

The build tool is Node.js 20 or newer. Packaging also needs `tar` and `dpkg-deb` (from `dpkg`). Smoking arm64 on an amd64 machine needs `libc6-arm64-cross`, `libstdc++6-arm64-cross`, and QEMU user-mode emulation: `qemu-user-binfmt` on Ubuntu 26.04, or `qemu-user-static` on earlier Ubuntu releases.

```sh
npm test
node scripts/build.mjs --arch amd64
node scripts/build.mjs --arch arm64
npm run build:all
```

With no `--arch`, the build targets the machine you are on. A successful build prints `--help` and `--version`, checks `status` while the server is stopped, then runs `start --no-open` with `DISPLAY` and `WAYLAND_DISPLAY` unset and checks `status`, `harnesses`, and `log`.

Artifacts:

```text
dist/mingle-cli-0.4.11-2-linux-amd64.tar.gz
dist/mingle-cli_0.4.11-2_amd64.deb
dist/mingle-cli-0.4.11-2-linux-arm64.tar.gz
dist/mingle-cli_0.4.11-2_arm64.deb
dist/SHA256SUMS
```

## Release

GitHub Actions publishes those artifacts only after this workflow is on the default branch and a matching tag is pushed. Do not create the tag before `.github/workflows/release.yml` is in the commit you tag.

1. Merge the packaging change to `main`.
2. Confirm `upstream.json` names a real [earayu/Mingle release](https://github.com/earayu/Mingle/releases), and that each `sha256` is the checksum of that release's Linux tarball.
3. From that `main` commit, tag the packaging version (`upstreamVersion` + `-` + `packagingRevision`):

   ```sh
   git tag v0.4.11-2
   git push origin v0.4.11-2
   ```

4. The **Release** workflow builds linux-amd64 and linux-arm64, runs the headless smoke test, and creates a GitHub Release for that tag. It uploads both archives, both `.deb` packages, and `SHA256SUMS`.
5. A tag that does not match `upstream.json` fails before upload. Pushing the tag is the publish step. This repository does not publish a release from a pull request.

To build the artifacts without publishing, run the **Release** workflow with `workflow_dispatch`. That uploads workflow artifacts only.

To package a newer upstream release, change `upstream.json` (version, filenames, and pinned checksums), bump `packagingRevision` to `1` for the new upstream version, and tag `v<upstreamVersion>-<packagingRevision>`. To repackage the same upstream bits, increment `packagingRevision` only.

## License

- Packaging in this repository: [MIT](LICENSE), Copyright 2026 AgentsRepos.
- Mingle: MIT, Copyright the Mingle authors, <https://github.com/earayu/Mingle>. The upstream license is copied into the built archive from the official tarball. It is not vendored in git.
- Node.js: the license shipped next to the official Node binary in the Mingle archive.
