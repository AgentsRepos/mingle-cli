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
| | 浏览器控制台（`core/dist/web`） |
| | X11 剪贴板插件（`pi-tui/native/linux`，含 `linux-platform-x11.node`） |
| | source map 和 TypeScript 声明文件 |

打包后的命令是 `mingle-cli`，不是 `mingle`，因此不会占用官方桌面应用的命令名。上游帮助文本仍把命令写成 `mingle`。阅读那些示例时，把它理解成 `mingle-cli`。

**linux-amd64** 和 **linux-arm64** 都会构建。每个 Release 包含：

- 一份独立压缩包，其中的可执行文件是 `mingle-cli`
- 一个 `.deb`，安装 `/usr/bin/mingle-cli` 和一个 systemd 单元
- `SHA256SUMS`

## 安装

### 一行安装

只支持 Linux amd64 和 arm64。[`install.sh`](install.sh) 会通过 GitHub API 读取本仓库最新的正式 Release，用该 Release 里的 `SHA256SUMS` 校验下载，然后安装。它不会启用或启动 systemd。脚本不写死 v0.4.11-1，以后的正式版会自动用上。其他操作系统或 CPU 架构会直接报错退出。

脚本会先看当前目录。`curl | sh` 用的是你执行命令时的目录，直接运行 `./install.sh` 也是这个目录。如果这里已经有匹配该 Release 的 `SHA256SUMS` 和安装包，并且校验通过，就直接用这些本地文件，不再从 GitHub 下载。

```sh
curl -fsSL https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh | sh
```

在 Debian 或 Ubuntu 上用 root 运行。v0.4.11-1 的 `SHA256SUMS` 已经包含两个 `.tar.gz` 和两个 `.deb`，所以上面这条 `sudo` 命令会用 `dpkg` 安装 `.deb`，命令是 `mingle-cli`。软件包的 postinst 只会重新加载 systemd，不会启用或启动服务。

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

选择和 `dpkg --print-architecture`（`amd64` 或 `arm64`）一致的文件。下面的版本号是当前打包修订号的例子；请改成你从 GitHub Release 下载的那个版本。

### Debian 软件包

```sh
sudo apt-get install ./mingle-cli_0.4.11-1_amd64.deb
mingle-cli --help
mingle-cli --version
```

`apt-get` 会装上捆绑 Node 二进制需要的共享库（`libc6`、`libstdc++6`、`libgcc-s1`、`ca-certificates`）。软件包名是 `mingle-cli`。它和名为 `mingle` 的软件包不冲突。

### 独立压缩包

```sh
tar -xzf mingle-cli-0.4.11-1-linux-amd64.tar.gz
cd mingle-cli-0.4.11-1-linux-amd64
./mingle-cli --help
./mingle-cli --version
```

压缩包本身是完整的。可以把那个目录挪到任何位置，再从里面运行 `mingle-cli`。

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

在有桌面的机器上，`--no-open` 是必要的：不加它时，`start` 会尝试打开控制台地址。本软件包不带浏览器控制台（`start` 会报告 `console not built`）。聊天应用相关命令和本地 API 仍然可用。若需要图形控制台，请使用官方 Mingle 桌面应用。

创建 agent 和连接 Telegram 使用的是同一套上游命令。把 `mingle` 换成 `mingle-cli`：

```sh
mingle-cli agent create --name Alex --harness claude --role "You help me plan trips."
echo "$TELEGRAM_BOT_TOKEN" | mingle-cli connect alex telegram
```

上游文档在 <https://github.com/earayu/Mingle> 和 <https://mingle.build>。

## systemd

`.deb` 会装上单元文件，但不会启用，也不会启动。在你明确启用之前，它不会接管整台机器。

用你自己的用户身份运行。这样服务和你在 shell 里执行的 `mingle-cli` 会共用 `~/.mingle`：

```sh
systemctl --user daemon-reload
systemctl --user enable --now mingle-cli
systemctl --user status mingle-cli
```

用户服务会在注销时停止。若希望注销后仍然运行：

```sh
sudo loginctl enable-linger "$USER"
```

若要作为系统服务、以某个已有账号运行（不是 root）：

```sh
sudo systemctl enable --now mingle-cli@alice
systemctl status mingle-cli@alice
```

`alice` 必须是真实用户。模板单元是 `mingle-cli@.service`。没有默认以 root 运行的系统单元。

进程执行的是 `mingle-cli start --no-open`。软件包升级之后，重启你启用过的服务，它才会用上新文件：

```sh
systemctl --user restart mingle-cli
# 或者
sudo systemctl restart mingle-cli@alice
```

卸载软件包时会停止系统模板实例。用户实例需要你自己先停掉：

```sh
systemctl --user disable --now mingle-cli
```

## 和官方 Mingle 的关系

[earayu/Mingle](https://github.com/earayu/Mingle) 是上游项目。它的 Linux 发行物是一个桌面应用，里面同时带有这个 Node CLI。`mingle-cli` 包装的是已经发布的那个 CLI。它不 fork Mingle 的源代码，也不另写一套 agent 实现。

构建时锁定的版本写在 [`upstream.json`](upstream.json)。`upstreamVersion` 是不带 `v` 的官方 release 标签。`packagingRevision` 是本仓库对那一次官方发布的打包修订号。上游 `0.4.11` 的第一次打包版本是 `0.4.11-1`。

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
dist/mingle-cli-0.4.11-1-linux-amd64.tar.gz
dist/mingle-cli_0.4.11-1_amd64.deb
dist/mingle-cli-0.4.11-1-linux-arm64.tar.gz
dist/mingle-cli_0.4.11-1_arm64.deb
dist/SHA256SUMS
```

## 发布

GitHub Actions 只有在该工作流已经位于默认分支、并且推送了匹配的标签之后，才会发布这些产物。在 `.github/workflows/release.yml` 进入你要打标签的那个提交之前，不要创建标签。

1. 把打包改动合并到 `main`。
2. 确认 `upstream.json` 指向一个真实的 [earayu/Mingle release](https://github.com/earayu/Mingle/releases)，并且每个 `sha256` 都是该 release 中对应 Linux 压缩包的校验和。
3. 在那个 `main` 提交上，为打包版本打标签（`upstreamVersion` + `-` + `packagingRevision`）：

   ```sh
   git tag v0.4.11-1
   git push origin v0.4.11-1
   ```

4. **Release** 工作流会构建 linux-amd64 和 linux-arm64，运行无界面冒烟测试，并为该标签创建 GitHub Release。它会上传两份压缩包、两个 `.deb` 和 `SHA256SUMS`。
5. 与 `upstream.json` 不一致的标签会在上传前失败。推送标签就是发布动作。本仓库不会从 pull request 发布 Release。

若只想构建、不发布，用 `workflow_dispatch` 手动运行 **Release** 工作流。那样只会上传 workflow artifact。

要打包更新的上游版本，修改 `upstream.json`（版本、文件名和锁定的校验和），把新上游版本的 `packagingRevision` 设为 `1`，然后打标签 `v<upstreamVersion>-<packagingRevision>`。若只是对同一份上游文件重新打包，只增加 `packagingRevision`。

## 许可证

- 本仓库中的打包代码：[MIT](LICENSE)，Copyright 2026 AgentsRepos。
- Mingle：MIT，版权归 Mingle 作者，<https://github.com/earayu/Mingle>。上游许可证在构建时从官方压缩包复制进产物，不会放进 git。
- Node.js：Mingle 官方压缩包里、Node 二进制旁边的那份许可证。
