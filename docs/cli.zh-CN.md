# mingle-cli 命令说明

本文说明本非官方打包项目提供的无界面命令 `mingle-cli`。它不是官方 Mingle 手册。

内容取自一次 Linux 构建：`mingle-cli --version` 打印 `0.4.11`。上游帮助文本仍把命令写成 `mingle`。这里安装的命令是 `mingle-cli`。下面引用程序原文时保留 `mingle`；你自己执行时请输入 `mingle-cli`。

子命令没有单独的帮助页。`mingle-cli`、`mingle-cli --help` 和 `mingle-cli -h` 打印同一段文字。只写分组名，例如 `agent` 或 `message`，会被拒绝：

```text
error: unknown_command
next: "agent" is not a mingle command; run "mingle --help"
```

## 全局选项

| 选项 | CLI 的行为 |
| --- | --- |
| `--help`、`-h` | 打印帮助。不带参数时也是这段文字。 |
| `--version`、`-v` | 只打印版本号，例如 `0.4.11`。 |
| `--json` | 帮助末尾写着：加上 `--json` 可得到机器可读输出。 |

未知选项会在命令执行前失败：

```text
error: invalid_arguments
next: Unknown option '--nope'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--nope"; run "mingle --help"
```

需要取值的选项如果没给值，也会这样失败。实测 `--port` 和 `--lines` 缺值时，提示是 `Option '--port <value>' argument missing` 或对应的 `--lines`。

## 所有者命令

这些是 `--help` 里 “For the owner” 下面的命令。其中多条要连接已经在运行的服务。服务没启动时，CLI 打印：

```text
error: mingle_not_running
next: Mingle is not running. Start it with "mingle start"
```

在没有服务运行时，`status`、`harnesses`、`open` 和 `proxy` 都是这个结果。`log` 直接读日志文件，可以在 `start` 之前使用。

| `--help` 中的写法 | `--help` 中的含义 |
| --- | --- |
| `mingle start [--port 7419] [--no-open]` | 在当前终端运行 Mingle，并打开控制台。 |
| `mingle open` | 打开正在运行的 Mingle 的控制台。 |
| `mingle proxy [system\|off\|set <url>]` | 查看或修改出站网络代理。 |
| `mingle status` | 各个 agent 及其连接。 |
| `mingle harnesses` | 这台电脑上已安装的 harness。 |
| `mingle agent create --name <n> --harness <id> [--model <m>] [--role <text> \| --role-file <path>]` | 创建 agent。 |
| `mingle agent role <agent>` | 用标准输入替换 `ROLE.md`。 |
| `mingle agent stop <agent>` | 停止它当前正在做的事。 |
| `mingle agent pause <agent>` | 停下来，在恢复之前不接收消息。 |
| `mingle agent resume <agent>` | 重新接收消息。 |
| `mingle agent reset <agent>` | 在新会话中重新开始；记忆和文件保留。 |
| `mingle agent diagnostics <agent> [--prompt]` | 版本、brain、会话和状态。`--prompt` 会把这些内容包进一段提示，供本地 agent 查原因并提交 GitHub issue。 |
| `mingle log [--agent <agent>] [--lines 200]` | Mingle 日志的末尾；可以只看提到某个 agent 的行。 |
| `mingle agent delete <agent> [--remove-home]` | 删除 agent。 |
| `mingle handoff <agent>` | 把另一段对话所知道的内容交给它，内容来自标准输入。 |
| `mingle handoff prompt <agent>` | 给那段对话使用的提示词。 |
| `mingle connect <agent> telegram` | 机器人 token 从标准输入读取。 |
| `mingle disconnect <connection-id>` | 断开一个连接。 |

缺少必填参数时，CLI 会打印它自己的用法。下面是它实际打印过的句子：

| 调用 | CLI 的提示 |
| --- | --- |
| `agent create` 且没有 `--name` | `usage: mingle agent create --name Alex --harness claude [--role ...\|--role-file path]` |
| `agent create --name Alex` 且没有 `--harness` | `pass --harness; "mingle harnesses" lists what is installed` |
| `agent role` | `usage: mingle agent role <agent> <<'ROLE' ... ROLE` |
| `agent stop`、`pause`、`resume` 或 `reset` | `usage: mingle agent <动词> <agent>` |
| `agent diagnostics` | `usage: mingle agent diagnostics <agent> [--prompt]` |
| `agent delete` | `usage: mingle agent delete <agent> [--remove-home]` |
| `handoff` | `usage: mingle handoff <agent> <<'HANDOFF' ... HANDOFF` |
| `connect` | `usage: echo $BOT_TOKEN \| mingle connect <agent> telegram` |
| `connect alex` 且标准输入没有 token | `pass the bot token from @BotFather on standard input` |
| `disconnect` | `usage: mingle disconnect <connection-id>` |

`--port` 是帮助里写的监听端口，示例为 `7419`。本软件包的 `start` 会报告 `console not built`，因为没有附带浏览器控制台；请加上 `--no-open`，避免它去打开网址。帮助里 `log --lines` 的默认值是 200。`--lines` 不是整数时会被拒绝，错误码是 `invalid_lines`，示例为 `--lines 300`。

不带后续参数的 `mingle-cli proxy` 会被接受，然后要求服务已经在运行。在这个 0.4.11 的 CLI 里，`mingle-cli proxy system`、`mingle-cli proxy off` 和 `mingle-cli proxy set` 会被当成 `unknown_command` 拒绝，尽管 `--help` 的 `proxy` 那一行写了这几个词。

## 会话内给 agent 用的命令

`--help` 把这些放在 “For agents (inside a session)” 下面。不在会话里时，CLI 会拒绝其中多条：

```text
error: not_in_agent_session
next: this command is for agents; it needs MINGLE_API and MINGLE_TOKEN, which Mingle sets in the agent's session
```

`message send`、`chat list`、`contact list`、`task list`、`reminder list`、`whoami` 和 `manual` 都得到了这个错误。另一些形式会先检查参数，并打印用法。

| `--help` 中的写法 | 含义 |
| --- | --- |
| `mingle message reply <msg> \| send --to <chat\|contact> \| read <chat> \| search <words>` | 回复、发送、读取或搜索消息。 |
| `mingle chat list \| info <chat> \| hear <chat> --every 1h \| --mute \| --default` | 列出对话、查看一个对话，或改变收听频率。 |
| `mingle chat alias <chat> add\|remove <name>` | 增加或删除对话别名。 |
| `mingle contact list [name] \| info <user> \| name <user> "name" \| link <user> <user> \| unlink <user> \| note <user>` | 联系人。 |
| `mingle file get <file>` | 取回一个文件。 |
| `mingle task create \| run \| tell \| status \| done \| list \| update` | 任务。 |
| `mingle reminder set \| list \| snooze \| cancel` | 提醒。 |
| `mingle whoami \| manual` | 身份，或手册。 |

参数不足时 CLI 打印过的用法：

| 调用 | CLI 的提示 |
| --- | --- |
| `message reply` | `usage: mingle message reply <message-id> <<'MSG' ... MSG` |
| `message read` | `usage: mingle message read <chat-id> [--limit 30] [--before <message-id> \| --since <message-id> \| --around <message-id>]` |
| `message search` | `usage: mingle message search "words" [--in <chat-id>]` |
| `chat info` | `usage: mingle chat info <chat-id>` |
| `chat alias` | `usage: mingle chat alias <chat-id> add\|remove <name>` |
| `chat hear <chat>` 且三个标志都没给 | `pass exactly one of --every, --mute and --default; usage: mingle chat hear <chat-id> --every 1h \| --mute \| --default` |
| `contact info` | `usage: mingle contact info <user-or-person-id>` |
| `contact name` | `usage: mingle contact name <user-or-person-id> "name" \| mingle contact name <id> --clear` |
| `contact link` | `usage: mingle contact link <user-id> <user-id>` |
| `contact unlink` | `usage: mingle contact unlink <user-id>` |
| `contact note` | `usage: mingle contact note <user-or-person-id> <<'NOTE' ... NOTE \| mingle contact note <id> --clear` |
| `file get` | `usage: mingle file get <file-id> [--out <path>]` |
| `task create` | `usage: mingle task create "title" [--from <message-id>]` |
| `task run` | `usage: mingle task run "title" --from <message-id>, the brief on standard input` |
| `task tell` | `usage: mingle task tell <task-id> [--from <message-id>] [note on standard input]` |
| `task status` | `usage: mingle task status "Found the cause; fixing it"` |
| `task done` | `usage: mingle task done <task-id>, the summary on standard input` |
| `task update` | `usage: mingle task update <task-id> --status done` |
| `reminder set` | `usage: mingle reminder set "text" --in 6h \| --at <time> \| --every daily@09:00 [--check <command> [--once] [--for 7d\|forever]]` |
| `reminder snooze` | `usage: mingle reminder snooze <reminder-id> --by 2h` |
| `reminder cancel` | `usage: mingle reminder cancel <reminder-id>` |

`--help` 里发送消息的写法是 `message send --to <chat|contact>`。在已经写了 `--to`、但没有会话时，CLI 停在 `not_in_agent_session`，没有再打印更细的用法。
