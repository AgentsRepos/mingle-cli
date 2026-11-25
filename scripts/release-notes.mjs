#!/usr/bin/env node
import { loadUpstream } from "./packaging.mjs";

const upstream = await loadUpstream();
const version = upstream.packagingVersion;
const install = "https://raw.githubusercontent.com/AgentsRepos/mingle-cli/main/install.sh";

process.stdout.write(`This is an unofficial headless Linux packaging of [Mingle](https://github.com/earayu/Mingle) v${upstream.version}.
It is not an official Mingle product.

The downloadable archive contains the \`mingle-cli\` executable and the Node runtime it needs.
The .deb installs that executable and a systemd unit. The unit is not enabled automatically.

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

这是基于 [Mingle](https://github.com/earayu/Mingle) v${upstream.version} 的非官方、无图形界面 Linux 打包。
它不是官方 Mingle 产品。

可下载的压缩包包含 \`mingle-cli\` 可执行文件及其所需的 Node 运行时。
\`.deb\` 会安装该可执行文件和一个 systemd 单元，不会自动 enable。

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
