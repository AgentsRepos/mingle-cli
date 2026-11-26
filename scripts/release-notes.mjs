#!/usr/bin/env node
import { loadUpstream } from "./packaging.mjs";

const upstream = await loadUpstream();
const version = upstream.packagingVersion;
const install = "https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh";

process.stdout.write(`This is an unofficial headless Linux packaging of [Mingle](https://github.com/earayu/Mingle) v${upstream.version}.
It is not an official Mingle product.
The desktop GUI is omitted. The official browser console is included; without a display, start with --no-open and open the printed URL in a browser.

The downloadable archive contains the \`mingle-cli\` executable and the Node runtime it needs.
The .deb installs that executable, \`mingle-cli-service\`, and a systemd unit. The unit is not enabled automatically.
This revision adds \`mingle-cli-service daemon-reload\` from pull request #16. It is not an official Mingle command. The command uses the same user-bus path as \`start\`, \`stop\`, \`restart\`, and \`status\`: before \`systemctl --user daemon-reload\`, the helper fills \`XDG_RUNTIME_DIR\` and \`DBUS_SESSION_BUS_ADDRESS\` when they are unset and the user manager is already running. \`daemon-reload\` reloads unit files and does not start, stop, or enable the unit. \`start\`, \`stop\`, \`restart\`, and \`status\` still do not run \`daemon-reload\`. It still prepends \`PATH\` from the service account's home and discovers \`dsh\`, setting \`OAR_DSH_BIN\` when that variable is unset. \`start\` and \`restart\` print the console URL, including \`#token=\`.

### Online install

Linux amd64 and arm64 only. The script installs the latest stable release, checks \`SHA256SUMS\`, and does not enable or start systemd.

\`\`\`sh
curl -fsSL ${install} | sh
\`\`\`

On Debian or Ubuntu, install system-wide. When \`SHA256SUMS\` lists the \`.deb\`, this installs the package:

\`\`\`sh
curl -fsSL ${install} | sudo sh
\`\`\`

Download this machine's packages and \`SHA256SUMS\` without installing. This does not write \`install.sh\`:

\`\`\`sh
curl -fsSL ${install} | sh -s -- --download
\`\`\`

In a directory that already contains \`install.sh\`, \`./install.sh\` or \`sudo ./install.sh\` then prefers those verified files.

### Manual install

\`\`\`sh
# Debian package. Use the arm64 file on arm64.
sudo apt-get install ./mingle-cli_${version}_amd64.deb

# Or the standalone archive
tar -xzf mingle-cli-${version}-linux-amd64.tar.gz
./mingle-cli-${version}-linux-amd64/mingle-cli --help
\`\`\`

Verify downloads with SHA256SUMS. Install and service instructions are in the repository README.

---

这是基于 [Mingle](https://github.com/earayu/Mingle) v${upstream.version} 的非官方 Linux 打包。
它不是官方 Mingle 产品。
桌面图形界面不在包内；官方网页控制台会保留。没有显示器时请使用 --no-open，再用浏览器打开给出的地址。

可下载的压缩包包含 \`mingle-cli\` 可执行文件及其所需的 Node 运行时。
\`.deb\` 会安装该可执行文件、\`mingle-cli-service\` 和一个 systemd 单元，不会自动 enable。
本修订把 PR #16 的 \`mingle-cli-service daemon-reload\` 带进了包装助手。它不是官方 Mingle 的命令。该命令与 \`start\`、\`stop\`、\`restart\`、\`status\` 走同一条用户总线路径：在调用 \`systemctl --user daemon-reload\` 之前，若 \`XDG_RUNTIME_DIR\` 与 \`DBUS_SESSION_BUS_ADDRESS\` 未设置且用户管理器已在运行，助手会补上这两个变量。\`daemon-reload\` 只重新加载单元文件，不会启动、停止或 enable 单元。\`start\`、\`stop\`、\`restart\` 和 \`status\` 仍然不会调用 \`daemon-reload\`。它仍会动态补 PATH / 发现 dsh，并在找到 \`dsh\` 且 \`OAR_DSH_BIN\` 未设置时写入该变量。start/restart 会打印带 \`#token=\` 的控制台 URL。

### 在线安装

仅支持 Linux amd64 与 arm64。脚本安装最新正式版，用 \`SHA256SUMS\` 校验，不会启用或启动 systemd。

\`\`\`sh
curl -fsSL ${install} | sh
\`\`\`

在 Debian 或 Ubuntu 上做系统安装。当 \`SHA256SUMS\` 里有 \`.deb\` 时，这条命令会安装 \`.deb\`：

\`\`\`sh
curl -fsSL ${install} | sudo sh
\`\`\`

只下载、不安装。这会保存本机的安装包和 \`SHA256SUMS\`，不会写入 \`install.sh\`：

\`\`\`sh
curl -fsSL ${install} | sh -s -- --download
\`\`\`

在已经有 \`install.sh\` 的同一目录中执行 \`./install.sh\` 或 \`sudo ./install.sh\`，会优先使用当前目录里校验通过的包。

### 手工安装

\`\`\`sh
# Debian 软件包。arm64 请改用对应文件。
sudo apt-get install ./mingle-cli_${version}_amd64.deb

# 或独立压缩包
tar -xzf mingle-cli-${version}-linux-amd64.tar.gz
./mingle-cli-${version}-linux-amd64/mingle-cli --help
\`\`\`

下载后请用 SHA256SUMS 校验。安装与服务说明见仓库 README。
`);
