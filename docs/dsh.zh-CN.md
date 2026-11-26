# acp profile 的第三方 DSH 提供方

简体中文 · [English](dsh.md)

本文说明如何为 Mingle 拉起的 `acp` profile 添加第三方 DeepSeek Harness（DSH）提供方。它属于本非官方打包项目的文档，不是官方 Mingle 手册。

Mingle 需要这个 harness 时，OAR 会自己启动 `dsh --profile acp --patch <OAR 的 overlay>`。装在 `web` profile 里的插件只留在那个 profile。`acp` profile 只能看到用 `--profile acp` 加进去的插件。如果没有为 `acp` 配置其他提供方，默认路由是 `deepseek-official`，这时可能会因为缺少 `DEEPSEEK_API_KEY` 而报错。

下面的插件和凭证是你自己的 DSH 家目录 `~/.dsh` 里的配置。`mingle-cli` 软件包不附带这些插件，也不会替你安装或管理它们。服务如何找到 `dsh` 程序，见 [systemd](../README.zh-CN.md#systemd)。

下面两个提供方可以只配其中一个，也可以两个都配。配完后按最后一节重启一次，让随后启动的 `dsh` 进程读到这份配置。

## dsh-opencode-go

```sh
dsh plugin --profile acp add dsh-opencode-go
```

把你的 OpenCode Go key 写进 `~/.dsh/.env`。变量名必须是 `OPENCODE_API_KEY`。不要写成 `OPENCODE_GO_API_KEY`，也不要换成别的名字。

```text
OPENCODE_API_KEY=
```

密钥写在你自己的机器上，放在 `=` 后面。

## dsh-minimax-code-cn

```sh
dsh plugin --profile acp add @laoyuehanni/dsh-minimax-oauth
dsh plugin --profile web add @laoyuehanni/dsh-minimax-oauth
```

然后运行 `dsh web`，在浏览器里完成授权：

```sh
dsh web
```

授权凭证可以在 `~/.dsh/.credentials.yaml` 里查看。这是机密文件。不要把文件内容贴到公开的地方，也不要贴到聊天里。

## 重启服务

重启 mingle 服务，让新拉起的 `dsh` 进程用上这些插件和凭证：

```sh
mingle-cli-service daemon-reload
mingle-cli-service restart
```

这两条命令管理的是 [systemd](../README.zh-CN.md#systemd) 里说的用户单元。`daemon-reload` 重新加载单元文件。`restart` 会换成新的 mingle 进程。新进程启动 `dsh` 时，用的就是上面配好的 `acp` profile。
