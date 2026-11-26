# mingle-cli

<p align="center">
  <img src="icon.png" width="128" alt="Mingle 官方图标">
</p>

简体中文 · [English](README.md)

上面的图是 Mingle 官方图标，用来让这个软件包容易辨认。本仓库仍然是非官方打包项目。

[Mingle](https://github.com/earayu/Mingle) 命令行界面的非官方 Linux 无界面打包。安装之后，`mingle-cli` 可以在没有 `DISPLAY`、也没有 Wayland 会话的终端里运行。

本仓库不是官方 Mingle 产品，不由 Mingle 作者维护，也不替代官方桌面应用。Mingle 本体以 MIT 许可证发布。本打包项目同样使用 MIT 许可证。见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)。

## 你会得到什么

官方 Mingle Linux 压缩包里有一个用 mygo 和 WebKitGTK 做的桌面入口（`mingle`）。没有显示器时，它会以 `cannot open display` 退出。同一份压缩包里还有 Node.js 运行时，以及位于 `core/dist/cli/main.js` 的 Mingle CLI。本项目在构建时下载那份官方压缩包，只打包 CLI：

| 包含 | 不包含 |
| --- | --- |
| `node/bin/node` 以及 Node.js 许可证 | mygo/WebKit 桌面程序（`mingle`） |
| CLI 程序、它会加载的共享 JavaScript 和 npm 依赖 | 桌面启动器、图标、托盘图片 |
| 官方网页控制台（`core/dist/web`） | X11 剪贴板插件（`pi-tui/native/linux`，含 `linux-platform-x11.node`） |
| | source map 和 TypeScript 声明文件 |

打包后的命令是 `mingle-cli`，不是 `mingle`，因此不会占用官方桌面应用的命令名。上游帮助文本仍把命令写成 `mingle`。阅读那些示例时，把它理解成 `mingle-cli`。

**linux-amd64** 和 **linux-arm64** 都会构建。每个 Release 包含：

- 一份独立压缩包，其中的可执行文件是 `mingle-cli`
- 一个 `.deb`，安装 `/usr/bin/mingle-cli`、`/usr/bin/mingle-cli-service` 和 systemd 单元
- `SHA256SUMS`

## 安装

### 一行安装

只支持 Linux amd64 和 arm64。[`install.sh`](install.sh) 会通过 GitHub API 读取本仓库最新的正式 Release，用该 Release 里的 `SHA256SUMS` 校验下载，然后安装。它不会启用或启动 systemd。脚本不写死某一个打包修订号，装的就是当前最新正式版。其他操作系统或 CPU 架构会直接报错退出。

脚本会先看当前目录。`curl | sh` 用的是你执行命令时的目录，直接运行 `./install.sh` 也是这个目录。如果这里已经有匹配该 Release 的 `SHA256SUMS` 和安装包，并且校验通过，就直接用这些本地文件，不再从 GitHub 下载。

```sh
curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sh
```

在 Debian 或 Ubuntu 上用 root 运行。最新正式版的 `SHA256SUMS` 包含 `.tar.gz` 和 `.deb`，所以上面这条 `sudo` 命令会用 `dpkg` 安装 `.deb`，命令是 `mingle-cli`。软件包同时安装 `/usr/bin/mingle-cli-service`。用户单元和系统单元调用 `mingle-cli-service run`。在你自己的会话里，`mingle-cli-service start`、`stop`、`restart`、`status` 和 `daemon-reload` 管理用户单元。`XDG_RUNTIME_DIR` 或 `DBUS_SESSION_BUS_ADDRESS` 为空时，只要 `/run/user/$(id -u)` 和其中的 `bus` 套接字存在，这几条命令会补上缺失的变量。软件包的 postinst 只会重新加载 systemd，不会启用或启动服务。细节见 [systemd](#systemd)。

```sh
curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sudo sh
```

没有 root 时，同一条命令会把 `.tar.gz` 装到 `~/.local`，并在 `PATH` 里没有 `~/.local/bin` 时提示你加上。已经是 root、但系统没有 `dpkg` 时，压缩包会解到 `/usr/local`。

只把本机对应的安装包和 `SHA256SUMS` 保存到当前目录、先不安装时，用你已经有的安装脚本：

```sh
./install.sh --download
```

`MINGLE_CLI_DOWNLOAD=1 ./install.sh` 的效果相同。它不会下载或改写 `install.sh`。之后在这个目录里执行 `./install.sh` 或 `sudo ./install.sh`，就会复用已经保存的文件。

### 自行下载 Release 文件

选择和 `dpkg --print-architecture`（`amd64` 或 `arm64`）一致的文件。把 `<version>` 换成你下载的文件名里的打包版本。这些命令不写死某一个修订号。上面的一行安装跟随最新正式版。

### Debian 软件包

```sh
sudo apt-get install ./mingle-cli_<version>_amd64.deb
mingle-cli --help
mingle-cli --version
```

`apt-get` 会装上捆绑 Node 二进制需要的共享库（`libc6`、`libstdc++6`、`libgcc-s1`、`ca-certificates`）。软件包名是 `mingle-cli`。它和名为 `mingle` 的软件包不冲突。

### 独立压缩包

```sh
tar -xzf mingle-cli-<version>-linux-amd64.tar.gz
cd mingle-cli-<version>-linux-amd64
./mingle-cli --help
./mingle-cli --version
```

压缩包本身是完整的。可以把那个目录挪到任何位置，再从里面运行 `mingle-cli`。`mingle-cli-service` 和 `mingle-cli` 放在一起。systemd 单元文件由 `.deb` 安装。

解压前先核对下载：

```sh
sha256sum -c SHA256SUMS
```

## 用法

程序只监听 `127.0.0.1`。数据放在 `~/.mingle`。设置 `MINGLE_HOME` 可以换一个目录。命令说明来自本软件包的 `mingle-cli --help` 以及 CLI 自己打印的用法，见 [docs/cli.zh-CN.md](docs/cli.zh-CN.md)。

### 从其他机器访问

官方 Mingle v0.4.11 把 API 绑在 `127.0.0.1`。`mingle-cli start` 只有 `--port` 和 `--no-open`，没有 `--host`，也不能改成监听 `0.0.0.0`。本打包项目没有改上游的这一行为，也不为此重新发布版本。

`mingle-cli` 已经占用 `127.0.0.1:7419`。不要在同一台机器上再把转发程序绑到 `7419`，`0.0.0.0:7419` 会和它冲突。先安装 `socat`，然后在运行 Mingle 的这台机器上改用另一个对外端口：

```sh
socat TCP-LISTEN:7420,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:7419
```

在其他机器上打开 `http://<这台机器的地址>:7420`。

这样做会把本机 API 暴露到网络上。只建议在受信网络使用，并用防火墙限制这个端口。

更稳妥的做法是 SSH 本地转发，让 API 不直接出现在局域网上。在另一台机器上执行：

```sh
ssh -N -L 7419:127.0.0.1:7419 user@mingle-host
```

然后在那台机器上打开 `http://127.0.0.1:7419`。

```sh
mingle-cli --help
mingle-cli --version
mingle-cli start --no-open          # 让这个进程一直运行，不要打开浏览器
mingle-cli status
mingle-cli harnesses
mingle-cli log
```

没有显示器时，以及在桌面上又不希望 `start` 去打开浏览器时，请加上 `--no-open`。官方网页控制台包含在本软件包里。加上 `--no-open` 后，请自己用浏览器打开它打印的 `http://127.0.0.1:...` 地址，或上一节里转发后的地址。桌面图形界面不包含在内。

创建 agent 和连接 Telegram 使用的是同一套上游命令。把 `mingle` 换成 `mingle-cli`：

```sh
mingle-cli agent create --name Alex --harness claude --role "You help me plan trips."
echo "$TELEGRAM_BOT_TOKEN" | mingle-cli connect alex telegram
```

上游文档在 <https://github.com/earayu/Mingle> 和 <https://mingle.build>。

## systemd

`.deb` 会装上单元文件，但不会启用，也不会启动。在你明确启用之前，它不会接管整台机器。

用你自己的用户身份运行。这样服务和你在 shell 里执行的 `mingle-cli` 会共用 `~/.mingle`。`systemctl --user` 连接的是这个用户的会话总线。不要用 root 跑 `systemctl --user`：root 的 shell 没有该账号的会话总线。

shell 需要已设置 `$XDG_RUNTIME_DIR` 和 `$DBUS_SESSION_BUS_ADDRESS`。完整的登录会话会带上这两个变量。SSH 没有走完整登录会话，或者用 `su` / `sudo` 切到了另一个用户时，它们没有设置。这时执行 `systemctl --user daemon-reload` 会失败：

```
Failed to connect to user scope bus via local transport: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined (consider using --machine=<user>@.host --user to connect to bus of other user)
```

这是当前 shell 没有连上用户会话，不是 Debian 13 的 `systemctl` 机制故障。

用户服务会在注销时停止。linger 会让这个用户的服务管理器在注销后继续运行。`loginctl enable-linger` 需要 root。不加 `sudo` 时，logind 会试图通过 `/usr/bin/pkttyagent` 询问密码，而精简的 Debian 安装往往没有这个程序：

```
Failed to execute /usr/bin/pkttyagent: 没有那个文件或目录
Could not enable linger: Access denied
```

在 Debian 13 上通过 SSH 使用时，下面一组命令可用：

```sh
sudo loginctl enable-linger "$USER"
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload
systemctl --user enable --now mingle-cli
```

如果 `/run/user/$(id -u)` 还不存在，先执行 `sudo systemctl start user@$(id -u)`，或退出后重新 SSH 登录，再跑最后三行。

安装了 `mingle-cli-service` 之后，`mingle-cli-service daemon-reload` 会自己补齐用户总线并重新加载用户管理器。上面的 `export` 仍然是直接跑 `systemctl --user` 时连上总线的办法，包括 `systemctl --user enable`。

`mingle-cli-service start`、`stop`、`restart`、`status` 和 `daemon-reload` 会调用 `systemctl --user`。调用前，helper 会补上仍为空的两个变量。`XDG_RUNTIME_DIR` 为空且 `/run/user/$(id -u)` 存在时，把它设为这个目录。`DBUS_SESSION_BUS_ADDRESS` 为空且 `$XDG_RUNTIME_DIR/bus` 是套接字时，把它设为 `unix:path=$XDG_RUNTIME_DIR/bus`。已经设好的值保持不变。`run` 不改这两个变量，因为 systemd 给 `ExecStart` 的环境已经是对的。`start`、`stop`、`restart` 和 `status` 不会调用 `daemon-reload`。

运行时目录不存在，或总线套接字不存在时，helper 会在调用 `systemctl` 之前停下，并说明要先执行 `sudo loginctl enable-linger "$USER"`。目录仍然不在时，它还会说明再执行 `sudo systemctl start user@$(id -u)`。它也会说明不要用 root 跑 `systemctl --user`。helper 不会自己执行 `enable-linger`，也不会 enable 单元。`enable` 仍要你自己执行。

```sh
systemctl --user status mingle-cli
```

若要作为系统服务、以某个已有账号运行（不是 root）：

```sh
sudo systemctl enable --now mingle-cli@alice
systemctl status mingle-cli@alice
```

`alice` 必须是真实用户。模板单元是 `mingle-cli@.service`。没有默认以 root 运行的系统单元。

两个单元都通过 `/usr/bin/mingle-cli-service run` 启动。这个 helper 属于本软件包，不是上游 Mingle 的子命令。`run` 会把服务账号家目录下实际存在的目录补到 `PATH` 前面，原来的 `PATH` 仍留在后面。然后它用包内的 Node 运行 `mingle-cli start --no-open`。

这些目录是：

- `$HOME/.local/share/mise/shims`
- `$HOME/.local/share/mise/installs/node/latest/bin`
- `$HOME/.local/bin`
- 当这条 `PATH` 上已经能找到 `npm`，并且 `npm config get prefix` 打印出绝对前缀、其 `bin` 目录也存在时，再加上 `$PREFIX/bin`

用户服务使用该用户的家目录。`mingle-cli@alice` 使用 alice 的家目录，因为模板设置了 `User=%i`，systemd 会为这个账号设置 `HOME`。helper 在服务进程里执行，所以开机只靠 linger 也会生效。它直接读这个家目录，不读登录 shell，也不读 `~/.bashrc`，也不使用 `systemctl import-environment`。单元里的 `Environment=` 不会展开 `$(which dsh)`。

Mingle 在 `PATH` 里找到 `dsh`，或者 `OAR_DSH_BIN` 指向它时，会把 DeepSeek Harness 视为已安装。`OAR_DSH_BIN` 未设置或为空，并且加长后的 `PATH` 上有 `dsh` 时，`run` 会导出这个路径。已经设好的值保持不变，因此 drop-in 仍然优先。这里要写绝对路径：

```ini
# ~/.config/systemd/user/mingle-cli.service.d/dsh.conf
# 或 /etc/systemd/system/mingle-cli@alice.service.d/dsh.conf
[Service]
Environment=OAR_DSH_BIN=/home/alice/.local/share/mise/installs/node/latest/bin/dsh
```

加上这个文件之后，先重新加载拥有该单元的管理器，再重启服务。用户单元执行 `mingle-cli-service daemon-reload`，然后 `mingle-cli-service restart`。系统模板执行 `sudo systemctl daemon-reload`，然后 `sudo systemctl restart mingle-cli@alice`。

Mingle 拉起的 `acp` profile 所用的第三方提供方，配置在你自己的 DSH 家目录里；本软件包不会安装它们。见 [acp profile 的第三方 DSH 提供方](docs/dsh.zh-CN.md)。

在你自己的用户 shell 里，包括这两个变量为空、但 `/run/user/$(id -u)` 和总线套接字已经存在的 SSH 会话，同一个 helper 管理用户单元。下面这些命令不需要先做上面的 `export`：

```sh
mingle-cli-service daemon-reload
mingle-cli-service start
mingle-cli-service stop
mingle-cli-service restart
mingle-cli-service status
```

`daemon-reload` 执行 `systemctl --user daemon-reload`，让用户管理器重新读取磁盘上改过的单元文件。它不会启动、停止或 enable 单元。`start` 会启动用户单元。单元已经在跑时，它不会重启那个进程。它会等到进程开始听端口，然后在当前终端打印带 `#token=` 的控制台 URL。如果启动前就已经在跑，打印的是当前这条 URL。`restart` 会重启单元，等到新进程开始听端口后，打印新的 URL。这一行里的 token 是新进程生成的。`stop` 停止用户单元。`status` 显示 `systemctl --user status`；控制台已经在听端口时，同样带上这条 URL。`start`、`stop`、`restart` 和 `status` 不会改动已经加载的单元定义。

这些命令不会 enable 单元。它们不会运行 `mingle open`，因此不需要显示器。URL 来自 `~/.mingle/runtime.json`；设置了 `MINGLE_HOME` 时则来自 `$MINGLE_HOME/runtime.json`。只有该端口已经接受连接时才会打印。服务也要使用这个目录时，请在 unit drop-in 里同样设置 `MINGLE_HOME`。

`mingle-cli-service env` 打印当前进程里 `run` 会使用的 `PATH` 和 `OAR_DSH_BIN`。`XDG_RUNTIME_DIR` 或 `DBUS_SESSION_BUS_ADDRESS` 已经设置，或者 helper 能从用户运行时目录补上它们时，也会把这两行打出来。`PATH` 和 `OAR_DSH_BIN` 的含义与上面相同。登录 shell 的 `PATH` 通常比服务更宽。要看服务眼里的环境：

```sh
env -i HOME="$HOME" USER="$USER" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  mingle-cli-service env
```

系统模板仍用 `sudo systemctl` 管理，例如 `sudo systemctl restart mingle-cli@alice`。`mingle-cli-service start` 只作用于用户单元。

软件包升级之后，磁盘上的用户单元文件可能和用户管理器已经加载的副本不一致。`mingle-cli-service restart` 会重启进程并打印新的控制台 URL。重新加载改过的单元文件是单独一步，`restart` 不会做这件事。先执行 `daemon-reload`，再 `restart`。用户单元当前是停止的，则在 `daemon-reload` 之后用 `start`：

```sh
mingle-cli-service daemon-reload
mingle-cli-service restart
```

```sh
mingle-cli-service daemon-reload
mingle-cli-service start
```

软件包的 postinst 会对系统管理器执行 `systemctl daemon-reload`。已经启用的系统实例用 `sudo systemctl restart mingle-cli@alice` 重启。`mingle-cli-service daemon-reload` 只作用于用户管理器，不会 enable 单元。

卸载软件包时会停止系统模板实例。用户实例需要你自己先停掉：

```sh
systemctl --user disable --now mingle-cli
```

## 和官方 Mingle 的关系

[earayu/Mingle](https://github.com/earayu/Mingle) 是上游项目。它的 Linux 发行物是一个桌面应用，里面同时带有这个 Node CLI。`mingle-cli` 包装的是已经发布的那个 CLI。它不 fork Mingle 的源代码，也不另写一套 agent 实现。

构建时锁定的版本写在 [`upstream.json`](upstream.json)。`upstreamVersion` 是不带 `v` 的官方 release 标签。`packagingRevision` 是本仓库对那一次官方发布的打包修订号。上游 `0.4.11` 的第一次打包版本是 `0.4.11-1`。当前打包修订号是 `0.4.11-5`。本修订把 PR #16 的 `mingle-cli-service daemon-reload` 带进了包装助手。该命令与 `start`、`stop`、`restart`、`status` 走同一条用户总线路径：在调用 `systemctl --user daemon-reload` 之前，若 `XDG_RUNTIME_DIR` 与 `DBUS_SESSION_BUS_ADDRESS` 未设置且用户管理器已在运行，助手会补上这两个变量。`daemon-reload` 只重新加载单元文件，不会启动、停止或 enable 单元。`start`、`stop`、`restart` 和 `status` 仍然不会调用 `daemon-reload`。它不是官方 Mingle。

## 仓库中不存放上游源代码

不要把 earayu/Mingle 的源代码提交、复制或 vendoring 进本仓库。`scripts/build.mjs` 运行时才下载官方 release 压缩包，对照该 GitHub Release 上的 `SHA256SUMS` 以及 `upstream.json` 里锁定的校验和，然后再做筛选。构建产物留在 `dist/` 和 `build/`，这两个目录已被 git 忽略。

`npm test` 会运行 `scripts/check-repo.mjs`。它会拒绝被跟踪的上游目录、桌面文件、安装包，以及超过 1 MB 的已跟踪文件。

## 构建

构建工具是 Node.js 20 或更新版本。打包还需要 `tar` 和 `dpkg-deb`（来自 `dpkg`）。在 amd64 机器上对 arm64 做冒烟测试时，需要 `libc6-arm64-cross`、`libstdc++6-arm64-cross`，以及 QEMU 用户态模拟：Ubuntu 26.04 用 `qemu-user-binfmt`，更早的 Ubuntu 用 `qemu-user-static`。

```sh
npm test
node scripts/build.mjs --arch amd64
node scripts/build.mjs --arch arm64
npm run build:all
```

不传 `--arch` 时，构建目标是当前机器的架构。构建成功时会在未设置 `DISPLAY` 和 `WAYLAND_DISPLAY` 的环境里运行 `--help` 和 `--version`，在服务未启动时检查 `status`，然后执行 `start --no-open`，再检查 `status`、`harnesses` 和 `log`。

产物：

```text
dist/mingle-cli-0.4.11-5-linux-amd64.tar.gz
dist/mingle-cli_0.4.11-5_amd64.deb
dist/mingle-cli-0.4.11-5-linux-arm64.tar.gz
dist/mingle-cli_0.4.11-5_arm64.deb
dist/SHA256SUMS
```

## 发布

GitHub Actions 只有在该工作流已经位于默认分支、并且推送了匹配的标签之后，才会发布这些产物。在 `.github/workflows/release.yml` 进入你要打标签的那个提交之前，不要创建标签。

1. 把打包改动合并到 `main`。
2. 确认 `upstream.json` 指向一个真实的 [earayu/Mingle release](https://github.com/earayu/Mingle/releases)，并且每个 `sha256` 都是该 release 中对应 Linux 压缩包的校验和。
3. 在那个 `main` 提交上，为打包版本打标签（`upstreamVersion` + `-` + `packagingRevision`）：

   ```sh
   git tag v0.4.11-5
   git push origin v0.4.11-5
   ```

4. **Release** 工作流会构建 linux-amd64 和 linux-arm64，运行无界面冒烟测试，并为该标签创建 GitHub Release。它会上传两份压缩包、两个 `.deb` 和 `SHA256SUMS`。
5. 与 `upstream.json` 不一致的标签会在上传前失败。推送标签就是发布动作。本仓库不会从 pull request 发布 Release。

若只想构建、不发布，用 `workflow_dispatch` 手动运行 **Release** 工作流。那样只会上传 workflow artifact。

要打包更新的上游版本，修改 `upstream.json`（版本、文件名和锁定的校验和），把新上游版本的 `packagingRevision` 设为 `1`，然后打标签 `v<upstreamVersion>-<packagingRevision>`。若只是对同一份上游文件重新打包，只增加 `packagingRevision`。

## 许可证

- 本仓库中的打包代码：[MIT](LICENSE)，Copyright 2026 AgentsRepos。
- Mingle：MIT，版权归 Mingle 作者，<https://github.com/earayu/Mingle>。上游许可证在构建时从官方压缩包复制进产物，不会放进 git。
- Node.js：Mingle 官方压缩包里、Node 二进制旁边的那份许可证。
