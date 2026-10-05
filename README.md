<div align="center">

# credential-paster

**Give your AI coding agent API keys – without giving them to the AI.**

[![skills.sh](https://img.shields.io/badge/skills.sh-credential--paster-000?style=flat-square)](https://www.skills.sh/timarnoldev/credential-paster/credential-paster)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-d97757?style=flat-square)](#install)
[![macOS | Linux](https://img.shields.io/badge/macOS_|_Linux-supported-3fb950?style=flat-square)](#cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

```bash
npx skills add timarnoldev/credential-paster
```

<img src="docs/demo.svg" alt="Claude Code asks for OPENAI_API_KEY, a masked paste field opens, the key is written to .env without entering the chat" width="760">

</div>

<br>

When an agent needs a credential, the usual answer is to paste it into the chat. From then on it lives in the transcript, the model's context and your logs.

**credential-paster** splits the job: the agent decides *where* a secret goes, you supply the *value* through a channel the agent cannot read, and a tiny script writes it straight into the file.

<table>
<tr>
<td width="50%" valign="top">

### Never in the chat
The value doesn't show up in the transcript, the model's context, shell history, `ps` or tool output. The agent only ever sees `SET` / `MISSING`.

</td>
<td width="50%" valign="top">

### Any file format
`.env` out of the box. JSON, YAML, TOML, `.npmrc`, `.netrc`, connection URLs, PEM keys via placeholders, with the right escaping.

</td>
</tr>
<tr>
<td valign="top">

### Paste field in Claude Code
A masked input right above the prompt. Paste, Enter, done. Also: native password dialog, clipboard, hidden terminal prompt, password managers.

</td>
<td valign="top">

### Works with every agent
Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode and anything else that reads [Agent Skills](https://agentskills.io). Bash + awk only.

</td>
</tr>
</table>

## Install

| Agent | Command |
|---|---|
| **Claude Code** – recommended, includes the paste field | `/plugin marketplace add timarnoldev/credential-paster`<br>`/plugin install credential-paster@credential-paster` |
| **Codex, Cursor, Gemini CLI, Copilot, OpenCode, …** | `npx skills add timarnoldev/credential-paster` |
| **Manual** – also puts `paste-secret` on your `PATH` | `git clone https://github.com/timarnoldev/credential-paster && ./credential-paster/install.sh` |

> [!TIP]
> Restart Claude Code after installing the plugin – the paste field's tool is registered when a session starts, `/reload-plugins` is not enough.
> Using the plugin? Don't also select Claude Code in `npx skills add`, otherwise the skill is installed twice.

Optionally pick a default input method so the agent doesn't ask:

```bash
export PASTE_SECRET_METHOD=dialog   # dialog | clipboard | tty | stdin
```

## How it works

```mermaid
sequenceDiagram
    actor You
    participant Agent
    participant PS as paste-secret
    participant File as .env / config

    Agent->>PS: request OPENAI_API_KEY for .env
    PS->>You: masked field / password dialog
    You-->>PS: paste secret
    PS->>File: write value (escaped, mode 600)
    PS-->>Agent: "OK: OPENAI_API_KEY set in .env"
    Note over Agent: never sees the value,<br/>uses it by reference only
```

Just ask for what you need – *"hook up the OpenAI client"*, *"add my npm token"* – the skill kicks in when a credential is missing. You can also open the field yourself in Claude Code:

```
/paste-secret .env OPENAI_API_KEY
```

## Input methods

| Method | How you paste | macOS | Linux |
|---|---|---|---|
| **Paste field** | masked field inside Claude Code | yes | yes |
| **Dialog** | native password dialog pops up | built-in | `zenity` / `kdialog` |
| **Clipboard** | copy, say "ok" – cleared afterwards | built-in | `wl-paste` / `xclip` / `xsel` |
| **Terminal** | hidden prompt in your own terminal | yes | yes |
| **Password manager** | `op read … \| paste-secret --stdin …` | yes | yes |

## CLI

<details>
<summary><b>Examples</b></summary>

```bash
# .env files: set KEY (file created if missing, mode 600)
paste-secret .env OPENAI_API_KEY                 # hidden terminal prompt
paste-secret --dialog    .env OPENAI_API_KEY     # native password dialog
paste-secret --clipboard .env OPENAI_API_KEY     # from clipboard, then clears it
op read "op://Private/OpenAI/key" | paste-secret --stdin .env OPENAI_API_KEY

# any format: replace a placeholder the agent put into the file
paste-secret --dialog --placeholder __PASTE_SECRET_TOKEN__ config.json            # JSON-escaped (auto)
paste-secret --dialog --placeholder __PASTE_SECRET_DB__ --escape url compose.yml  # percent-encoded

# status without revealing anything
paste-secret --check .env OPENAI_API_KEY                                # SET | EMPTY | MISSING
paste-secret --check --placeholder __PASTE_SECRET_TOKEN__ config.json   # DONE | PENDING
paste-secret --info                                                     # preferred + available methods
```

</details>

<details>
<summary><b>Placeholders & escape modes</b></summary>

| File | The agent writes | Escape |
|---|---|---|
| `config.json` | `"token": "__PASTE_SECRET_TOKEN__"` | `json` (auto) |
| YAML / TOML | `token: "__PASTE_SECRET_TOKEN__"` | `json` |
| `.npmrc` | `//registry.npmjs.org/:_authToken=__PASTE_SECRET_NPM__` | `none` |
| `.netrc` | `machine api.x.com login me password __PASTE_SECRET_PW__` | `none` |
| connection URL | `postgres://user:__PASTE_SECRET_DB__@host/db` | `url` |
| shell script | `TOKEN=__PASTE_SECRET_TOKEN__` | `shell` |
| PEM / multi-line | `__PASTE_SECRET_KEY__` on its own line | `none` |

`auto` picks `json` for `*.json`, `dotenv` for `.env*`, otherwise `none`. See `paste-secret --help`.

</details>

## Security

- The value reaches `awk` via the environment, never via argv – invisible in `ps`.
- The script never prints the value; output is file, key and status only.
- Clipboard mode is convenient, but clipboard managers with history may keep a copy.
- The Claude Code paste field is built on the plugin hooks API (early access); without an interactive UI the agent falls back to the other methods.
- For a hard guarantee that Claude never reads secret files, add to `~/.claude/settings.json`:
  ```json
  { "permissions": { "deny": ["Read(**/.env)", "Read(**/.env.*)"] } }
  ```

## Why

A masked input for secrets [was requested for Claude Code](https://github.com/anthropics/claude-code/issues/78717) and closed as not planned. credential-paster fills that gap – for Claude Code and every other agent.

## Development

```bash
claude plugin test .                                                        # Claude Code plugin
tests/test.sh                                                               # CLI on macOS
docker run --rm -v "$PWD":/w -w /w debian:stable-slim bash tests/test.sh   # CLI on Linux
```

<div align="center"><sub>MIT © <a href="https://github.com/timarnoldev">Tim Arnold</a></sub></div>
