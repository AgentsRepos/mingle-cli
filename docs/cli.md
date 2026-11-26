# mingle-cli command reference

English · [简体中文](cli.zh-CN.md)

This page describes the headless `mingle-cli` command shipped by this unofficial packaging project. It is not an official Mingle manual.

The text was taken from a Linux build whose `mingle-cli --version` prints `0.4.11`. Upstream's help still names the command `mingle`. The command installed here is `mingle-cli`. In the examples below, the program's own wording is quoted with `mingle`; type `mingle-cli` when you run it.

There is no separate help screen for subcommands. `mingle-cli`, `mingle-cli --help`, and `mingle-cli -h` print the same text. A name by itself, such as `agent` or `message`, is rejected:

```text
error: unknown_command
next: "agent" is not a mingle command; run "mingle --help"
```

## Global options

| Option | What the CLI does |
| --- | --- |
| `--help`, `-h` | Print the help text. With no arguments, the same text is printed. |
| `--version`, `-v` | Print the version only, for example `0.4.11`. |
| `--json` | The help text says: add `--json` for machine-readable output. |

An unknown option fails before a command runs:

```text
error: invalid_arguments
next: Unknown option '--nope'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--nope"; run "mingle --help"
```

Options that take a value, such as `--port` and `--lines`, fail the same way when the value is missing (`Option '--port <value>' argument missing`).

## Owner commands

These are the commands under "For the owner" in `--help`. Several of them talk to a running server. If it is not running, the CLI prints:

```text
error: mingle_not_running
next: Mingle is not running. Start it with "mingle start"
```

That was the result for `status`, `harnesses`, `open`, and `proxy` when nothing was running. `log` reads the log file directly and can run before `start`.

| Command as printed by `--help` | Meaning printed by `--help` |
| --- | --- |
| `mingle start [--port 7419] [--no-open]` | Run Mingle in this terminal and open the console. |
| `mingle open` | Open the console of the running Mingle. |
| `mingle proxy [system\|off\|set <url>]` | Show or change outbound network proxy settings. |
| `mingle status` | Agents and their connections. |
| `mingle harnesses` | Harnesses installed on this computer. |
| `mingle agent create --name <n> --harness <id> [--model <m>] [--role <text> \| --role-file <path>]` | Create an agent. |
| `mingle agent role <agent>` | Replace `ROLE.md` from standard input. |
| `mingle agent stop <agent>` | Stop what it is doing now. |
| `mingle agent pause <agent>` | Stop it and take no messages until resumed. |
| `mingle agent resume <agent>` | Take messages again. |
| `mingle agent reset <agent>` | Start it over in a new session; memory and files stay. |
| `mingle agent diagnostics <agent> [--prompt]` | Versions, brain, session and status. `--prompt` wraps them in a prompt for a local agent to find the cause and file a GitHub issue. |
| `mingle log [--agent <agent>] [--lines 200]` | The end of Mingle's log, optionally only what mentions an agent. |
| `mingle agent delete <agent> [--remove-home]` | Delete an agent. |
| `mingle handoff <agent>` | Hand it what another conversation knows, on standard input. |
| `mingle handoff prompt <agent>` | The prompt to give that conversation. |
| `mingle connect <agent> telegram` | Bot token on standard input. |
| `mingle disconnect <connection-id>` | Disconnect a connection. |

When a required argument is missing, the CLI prints its own usage line. These are the lines it printed:

| Invocation | CLI message |
| --- | --- |
| `agent create` with no `--name` | `usage: mingle agent create --name Alex --harness claude [--role ...\|--role-file path]` |
| `agent create --name Alex` with no `--harness` | `pass --harness; "mingle harnesses" lists what is installed` |
| `agent role` | `usage: mingle agent role <agent> <<'ROLE' ... ROLE` |
| `agent stop`, `pause`, `resume`, or `reset` | `usage: mingle agent <verb> <agent>` |
| `agent diagnostics` | `usage: mingle agent diagnostics <agent> [--prompt]` |
| `agent delete` | `usage: mingle agent delete <agent> [--remove-home]` |
| `handoff` | `usage: mingle handoff <agent> <<'HANDOFF' ... HANDOFF` |
| `connect` | `usage: echo $BOT_TOKEN \| mingle connect <agent> telegram` |
| `connect alex` with no token on stdin | `pass the bot token from @BotFather on standard input` |
| `disconnect` | `usage: mingle disconnect <connection-id>` |

`--port` is the listen port shown in help as `7419`. The process still binds `127.0.0.1` only; `--help` has no `--host` option. To reach it from another machine without changing that, see [Reach it from another machine](../README.md#reach-it-from-another-machine). The official web console is included. Without a display, pass `--no-open` and open the printed URL in a browser. `log --lines` defaults to 200 in the help text. A non-integer `--lines` is rejected with `invalid_lines` and the example `--lines 300`.

`mingle-cli proxy` with no further argument is accepted and then requires a running server. In this 0.4.11 CLI, `mingle-cli proxy system`, `mingle-cli proxy off`, and `mingle-cli proxy set` are rejected as `unknown_command`, even though `--help` prints those words on the `proxy` line.

## Commands for an agent inside a session

`--help` groups these under "For agents (inside a session)". Outside a session the CLI refuses many of them:

```text
error: not_in_agent_session
next: this command is for agents; it needs MINGLE_API and MINGLE_TOKEN, which Mingle sets in the agent's session
```

`message send`, `chat list`, `contact list`, `task list`, `reminder list`, `whoami`, and `manual` produced that error. Other forms check their arguments first and print a usage line.

| Command as printed by `--help` | |
| --- | --- |
| `mingle message reply <msg> \| send --to <chat\|contact> \| read <chat> \| search <words>` | Reply, send, read, or search messages. |
| `mingle chat list \| info <chat> \| hear <chat> --every 1h \| --mute \| --default` | List chats, show one, or change how often it is heard. |
| `mingle chat alias <chat> add\|remove <name>` | Add or remove a chat alias. |
| `mingle contact list [name] \| info <user> \| name <user> "name" \| link <user> <user> \| unlink <user> \| note <user>` | Contacts. |
| `mingle file get <file>` | Fetch a file. |
| `mingle task create \| run \| tell \| status \| done \| list \| update` | Tasks. |
| `mingle reminder set \| list \| snooze \| cancel` | Reminders. |
| `mingle whoami \| manual` | Identity, or the manual. |

Usage lines the CLI printed when arguments were missing:

| Invocation | CLI message |
| --- | --- |
| `message reply` | `usage: mingle message reply <message-id> <<'MSG' ... MSG` |
| `message read` | `usage: mingle message read <chat-id> [--limit 30] [--before <message-id> \| --since <message-id> \| --around <message-id>]` |
| `message search` | `usage: mingle message search "words" [--in <chat-id>]` |
| `chat info` | `usage: mingle chat info <chat-id>` |
| `chat alias` | `usage: mingle chat alias <chat-id> add\|remove <name>` |
| `chat hear <chat>` with none of the three flags | `pass exactly one of --every, --mute and --default; usage: mingle chat hear <chat-id> --every 1h \| --mute \| --default` |
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

`message send --to <chat|contact>` is the form in `--help`. With `--to` set and no session, the CLI stopped at `not_in_agent_session` instead of printing a further usage line.
