# credential-paster

An [Agent Skill](https://agentskills.io) plus a tiny CLI that lets AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, …) put your API keys, tokens and passwords into config files **without the secret ever appearing** in the chat, your shell history, process arguments or tool output.

The agent decides *where* the secret goes. You supply the *value* – via a native password dialog, the clipboard, a hidden terminal prompt or your password manager.

```
Agent: I need OPENAI_API_KEY in .env – a password dialog will open.
       $ paste-secret --dialog .env OPENAI_API_KEY
       OK: OPENAI_API_KEY set in .env (mode 600).
```

## Install

**Claude Code (plugin):**
```
/plugin marketplace add timarnoldev/credential-paster
/plugin install credential-paster@credential-paster
```

**Any agent (script):**
```bash
git clone https://github.com/timarnoldev/credential-paster
cd credential-paster && ./install.sh
```
Links the skill into `~/.agents/skills` (Codex, Cursor, Gemini CLI, OpenCode, …), `~/.claude/skills` and – if present – `~/.codex/skills`, and puts `paste-secret` into `~/.local/bin`. Use `--copy` to copy instead of symlink, `--uninstall` to remove.

Optional default input method (otherwise the agent asks you):
```bash
export PASTE_SECRET_METHOD=dialog   # dialog | clipboard | tty | stdin
```

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
tests/test.sh                                                     # macOS
docker run --rm -v "$PWD":/w -w /w debian:stable-slim bash tests/test.sh   # Linux
```
