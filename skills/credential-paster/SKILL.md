---
name: credential-paster
description: Gets API keys, tokens, passwords and other secrets from the user into any config file (.env, JSON, YAML, TOML, .npmrc, .netrc, …) without the value ever appearing in the chat, shell history, command arguments or tool output. Use whenever a task needs a credential the user must supply (missing API key, "add my token", auth fails, setting DATABASE_URL), or when the user is about to paste a secret into the conversation.
---

# Credential Paster

Secrets never pass through the conversation. You decide **where** a secret goes; the user supplies the **value** through `paste-secret`, which writes it into the file and never prints it.

Script: `scripts/paste-secret` in this skill's directory (use the absolute path; if `paste-secret` is on `PATH`, that works too).

## Hard rules

- NEVER ask for a secret in the chat. If the user pastes one anyway: don't repeat it, recommend rotating it, continue with the workflow.
- NEVER put a secret value into a command (`export KEY=sk-…`, `curl -H "Authorization: Bearer sk-…"`, `echo … >> .env`).
- NEVER read or print files after a secret was inserted (`cat`, `grep`, `env`, `printenv`, file-read tools). Verify with `paste-secret --check`.
- Use secrets by reference only: let the program load the file itself (dotenv, `--env-file`, compose `env_file`, config path), or load it in a subshell: `(set -a; . ./.env; set +a; curl -sS -H "Authorization: Bearer $API_KEY" …)`. Make sure output does not echo the secret.

## Workflow

### 1. Choose the target

**`.env`-style file** → dotenv mode, nothing to prepare:
```bash
paste-secret --check .env OPENAI_API_KEY        # SET | EMPTY | MISSING
```

**Any other file or format** → write the file yourself with a unique placeholder exactly where the secret belongs, then use placeholder mode. Use `__PASTE_SECRET_<NAME>__` as the placeholder – it is valid unquoted in every common format.

| File | Write this | Escape |
|---|---|---|
| `config.json` | `"token": "__PASTE_SECRET_TOKEN__"` | `json` (auto for `*.json`) |
| YAML / TOML | `token: "__PASTE_SECRET_TOKEN__"` | `json` (inside double quotes) |
| `.npmrc` | `//registry.npmjs.org/:_authToken=__PASTE_SECRET_NPM__` | `none` |
| `.netrc` | `machine api.x.com login me password __PASTE_SECRET_PW__` | `none` |
| connection URL | `postgres://user:__PASTE_SECRET_DB__@host/db` | `url` |
| shell script | `TOKEN=__PASTE_SECRET_TOKEN__` | `shell` |
| PEM / multi-line | `__PASTE_SECRET_KEY__` on its own line | `none` |

Escape modes: `json` escapes string *content* (you write the quotes); `dotenv` and `shell` produce a *complete* value incl. quotes; `url` percent-encodes; `none` inserts raw. Default `auto` = json for `*.json`, dotenv for `.env*`, else none. All occurrences of the placeholder are replaced. Make sure the file is git-ignored (or outside the repo) before inserting.

### 2. Let the user pick how to supply the value

Run `paste-secret --info` once. It prints the user's preferred method (`PASTE_SECRET_METHOD`) and the methods that work in your environment.

- If a preference is set and available → use it without asking.
- Otherwise ask the user which method they want and remember the answer for the rest of the session. Offer only what is available:
  - **dialog** – a native hidden-input password dialog pops up on their screen. You run the command; it waits until they submit.
  - **clipboard** – they copy the secret and confirm; you run the command; the clipboard is cleared afterwards. (Less safe if they use a clipboard manager with history.)
  - **terminal** – they run the command themselves in their own terminal and paste with hidden input. Give them the full command with absolute paths.
  - **password manager** – `op read "op://Vault/Item/field" | paste-secret --stdin …` (also `pass`, `bw get password`, …); you may run it if the CLI is authenticated.

Commands (add `--placeholder <MARKER> [--escape MODE]` and drop `<KEY>` for placeholder mode):
```bash
paste-secret --dialog    <FILE> <KEY>
paste-secret --clipboard <FILE> <KEY>      # only after the user confirmed they copied it
paste-secret             <FILE> <KEY>      # user runs this in their terminal
```

Tell the user briefly what will happen (e.g. "A password dialog will open for OPENAI_API_KEY"), then run it. Exit code ≠ 0 means nothing was written – report the message, don't retry in a loop.

### 3. Verify, then continue

```bash
paste-secret --check .env OPENAI_API_KEY
paste-secret --check --placeholder __PASTE_SECRET_TOKEN__ config.json   # DONE | PENDING
```
Then resume the original task using the secret by reference.
