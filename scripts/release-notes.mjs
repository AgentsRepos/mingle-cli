#!/usr/bin/env node
import { loadUpstream } from "./packaging.mjs";

const upstream = await loadUpstream();
const version = upstream.packagingVersion;

process.stdout.write(`This is an unofficial headless Linux packaging of [Mingle](https://github.com/earayu/Mingle) v${upstream.version}.
It is not an official Mingle product.

The downloadable archive contains the \`mingle-cli\` executable and the Node runtime it needs.
The .deb installs that executable and a systemd unit. The unit is not enabled automatically.

\`\`\`sh
# Debian package. Use the arm64 file on arm64.
sudo apt-get install ./mingle-cli_${version}_amd64.deb

# Or the standalone archive
tar -xzf mingle-cli-${version}-linux-amd64.tar.gz
./mingle-cli-${version}-linux-amd64/mingle-cli --help
\`\`\`

Verify downloads with SHA256SUMS. Install and service instructions are in the repository README.
`);
