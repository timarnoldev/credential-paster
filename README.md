# credential-paster

[![skills.sh](https://img.shields.io/badge/skills.sh-credential--paster-black)](https://www.skills.sh/timarnoldev/credential-paster/credential-paster)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

An [Agent Skill](https://agentskills.io) plus a tiny CLI that lets AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, …) put your API keys, tokens and passwords into config files **without the secret ever appearing** in the chat, your shell history, process arguments or tool output.

The agent decides *where* the secret goes. You supply the *value* – via a native password dialog, the clipboard, a hidden terminal prompt or your password manager.

```
Agent: I need OPENAI_API_KEY in .env – a password dialog will open.
       $ paste-secret --dialog .env OPENAI_API_KEY
       OK: OPENAI_API_KEY set in .env (mode 600).
```

**Why?** Pasting a key into the chat puts it into the transcript, the model's context and logs. A masked input for secrets [was requested for Claude Code](https://github.com/anthropics/claude-code/issues/78717) and closed as not planned – this skill fills that gap for Claude Code and every other agent that reads Agent Skills.

## Install

**Claude Code (plugin, recommended – includes the masked paste field):**
```
/plugin marketplace add timarnoldev/credential-paster
/plugin install credential-paster@credential-paster
```

**Any agent via [skills.sh](https://www.skills.sh/timarnoldev/credential-paster/credential-paster)** (Codex, Cursor, Gemini CLI, Copilot, OpenCode, …):
```bash
npx skills add timarnoldev/credential-paster
```
The agent runs `paste-secret` from the installed skill folder. For Claude Code, prefer the plugin above instead of selecting it here, otherwise the skill is installed twice.

**Any agent (script, also puts `paste-secret` on your PATH):**
```bash
git clone https://github.com/timarnoldev/credential-paster
cd credential-paster && ./install.sh
```
Links the skill into `~/.agents/skills` (Codex, Cursor, Gemini CLI, OpenCode, …), `~/.claude/skills` and – if present – `~/.codex/skills`, and puts `paste-secret` into `~/.local/bin`. Use `--copy` to copy instead of symlink, `--uninstall` to remove.

Optional default input method (otherwise the agent asks you):
```bash
export PASTE_SECRET_METHOD=dialog   # dialog | clipboard | tty | stdin
```

## Paste field inside Claude Code

Installed as a Claude Code plugin, credential-paster also adds a masked paste field to the Claude Code UI (terminal, desktop app, VS Code):

- The agent calls the `request_secret` tool → a **Paste secret** pane opens above the prompt.
- You paste, the field only shows `••••••`, Enter saves. The value goes to `paste-secret` via stdin – never into the transcript or the model's context.
- The agent gets a short "saved" / "cancelled" message and continues.
- `/paste-secret <file> <KEY>` opens the field manually, `/paste-secret` reopens a pending request.

Built on Claude Code's plugin hooks API (early access). Without an interactive UI (headless, SDK hosts) the agent falls back to the methods below.

## CLI

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

Escape modes: `json` (also for double-quoted YAML/TOML strings), `dotenv`, `shell`, `url`, `none`. See `paste-secret --help`.

| Method | macOS | Linux |
|---|---|---|
| dialog | `osascript` (built-in) | `zenity` or `kdialog` + a display |
| clipboard | `pbpaste` (built-in) | `wl-paste` (Wayland), `xclip` or `xsel` (X11) |
| tty / stdin | ✓ | ✓ |

Requirements: bash ≥ 3.2, awk, od – nothing else.

## Security notes

- The secret is passed to `awk` via the environment, never via argv, so it does not show up in `ps`.
- The script never prints the value; output only contains file, key and status.
- Clipboard mode is convenient but clipboard managers with history may keep a copy.
- The skill tells the agent not to read secret files. For a hard guarantee in Claude Code, also add to `~/.claude/settings.json`:
  ```json
  { "permissions": { "deny": ["Read(**/.env)", "Read(**/.env.*)"] } }
  ```

## Development

```bash
claude plugin test .                                              # Claude Code UI plugin
tests/test.sh                                                     # macOS
docker run --rm -v "$PWD":/w -w /w debian:stable-slim bash tests/test.sh   # Linux
```
