#!/usr/bin/env bash
# Install the credential-paster skill for all detected AI coding agents and put
# paste-secret on PATH.
#
#   ./install.sh            symlink (updates via git pull)
#   ./install.sh --copy     copy instead of symlink
#   ./install.sh --uninstall
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)/skills/credential-paster"
bin="${BIN_DIR:-$HOME/.local/bin}"
mode=link
case "${1:-}" in
  --copy) mode=copy ;;
  --uninstall) mode=uninstall ;;
  "") ;;
  *) echo "usage: $0 [--copy|--uninstall]" >&2; exit 2 ;;
esac

# ~/.agents/skills: shared location read by Codex, Cursor, Gemini CLI, OpenCode, …
# ~/.claude/skills: Claude Code
targets=("$HOME/.agents/skills" "$HOME/.claude/skills")
[ -d "$HOME/.codex" ] && targets+=("$HOME/.codex/skills")

for dir in "${targets[@]}"; do
  dest="$dir/credential-paster"
  if [ "$mode" = uninstall ]; then
    [ -e "$dest" ] || [ -L "$dest" ] && rm -rf "$dest" && echo "removed $dest"
    continue
  fi
  mkdir -p "$dir"
  rm -rf "$dest"
  if [ "$mode" = copy ]; then cp -R "$src" "$dest"; else ln -s "$src" "$dest"; fi
  echo "skill  -> $dest"
done

if [ "$mode" = uninstall ]; then
  rm -f "$bin/paste-secret" && echo "removed $bin/paste-secret"
  exit 0
fi

mkdir -p "$bin"
if [ "$mode" = copy ]; then cp "$src/scripts/paste-secret" "$bin/paste-secret"
else ln -sf "$src/scripts/paste-secret" "$bin/paste-secret"; fi
chmod +x "$bin/paste-secret"
echo "script -> $bin/paste-secret"

case ":$PATH:" in *":$bin:"*) ;; *) echo "note: $bin is not on your PATH" ;; esac
echo
echo "Optional: choose a default input method in your shell profile, e.g."
echo "  export PASTE_SECRET_METHOD=dialog   # dialog | clipboard | tty | stdin"
