# Third-party DSH providers for the acp profile

English · [简体中文](dsh.zh-CN.md)

This page describes how to add third-party DeepSeek Harness (DSH) providers to the `acp` profile that Mingle starts. It belongs to this unofficial packaging project. It is not an official Mingle manual.

When Mingle needs the harness, OAR starts `dsh --profile acp --patch <OAR overlay>` itself. A plugin installed on the `web` profile stays on that profile. The `acp` profile only sees plugins added with `--profile acp`. If `acp` has no other provider, the default route is `deepseek-official`, and that route can fail because `DEEPSEEK_API_KEY` is missing.

These plugins and credentials belong to your DSH home, `~/.dsh`. The `mingle-cli` package does not ship them, and it does not install or manage them. How the service locates the `dsh` program is in [systemd](../README.md#systemd).

You can add either provider below, or both. After that, restart once, as in the last section, so the next `dsh` process loads that setup.

## dsh-opencode-go

```sh
dsh plugin --profile acp add dsh-opencode-go
```

Put your OpenCode Go key in `~/.dsh/.env`. The variable name must be `OPENCODE_API_KEY`. Do not use `OPENCODE_GO_API_KEY` or any other name.

```text
OPENCODE_API_KEY=
```

Write the key on your own machine, after `=`.

## dsh-minimax-code-cn

```sh
dsh plugin --profile acp add @laoyuehanni/dsh-minimax-oauth
dsh plugin --profile web add @laoyuehanni/dsh-minimax-oauth
```

Then run `dsh web` and finish authorization in the browser:

```sh
dsh web
```

You can read the saved authorization in `~/.dsh/.credentials.yaml`. That file is secret. Do not paste its contents into a public place or into a chat.

## Restart the service

Restart the mingle service so a newly started `dsh` process loads the plugins and credentials:

```sh
mingle-cli-service daemon-reload
mingle-cli-service restart
```

Both commands act on the user unit described in [systemd](../README.md#systemd). `daemon-reload` reloads unit files. `restart` replaces the mingle process. The new process is what starts `dsh` with the `acp` profile configured above.
