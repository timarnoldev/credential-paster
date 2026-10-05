#!/usr/bin/env bash
# Einfache Tests für paste-secret (nutzt --stdin, kein TTY/Clipboard nötig).
set -u
SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/skills/credential-paster/scripts/paste-secret"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0

ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }
expect_file() { # name expected
  if [ "$(cat "$T/.env")" = "$2" ]; then ok "$1"; else bad "$1"; printf '%s\n---\n%s\n' "$(cat "$T/.env")" "$2"; fi
}

cd "$T"

# Neue Datei
printf 'sk-abc123\n' | "$SCRIPT" --stdin .env API_KEY >out 2>&1
expect_file "neue Datei anlegen" "API_KEY=sk-abc123"
grep -q 'sk-abc' out && bad "Wert in Ausgabe" || ok "Wert nicht in Ausgabe"
[ "$(ls -l .env | cut -c1-10)" = "-rw-------" ] && ok "Rechte 600" || bad "Rechte 600"

# Ersetzen, export-Präfix, andere Zeilen bleiben
printf '# comment\nFOO=bar\nexport API_KEY=old\nBAZ=1\n' >.env
printf 'new' | "$SCRIPT" --stdin .env API_KEY >/dev/null
expect_file "ersetzen mit export" "$(printf '# comment\nFOO=bar\nexport API_KEY=new\nBAZ=1')"

# Ähnliche Keys nicht anfassen
printf 'API_KEY_2=x\n' >.env
printf 'y' | "$SCRIPT" --stdin .env API_KEY >/dev/null
expect_file "Präfix-Key unberührt" "$(printf 'API_KEY_2=x\nAPI_KEY=y')"

# Sonderzeichen werden gequotet
: >.env
printf '%s' 'a"b$c`d\e f' | "$SCRIPT" --stdin .env PW >/dev/null
expect_file "Quoting" 'PW="a\"b\$c\`d\\e f"'
[ "$(set -a; . ./.env; printf '%s' "$PW")" = 'a"b$c`d\e f' ] && ok "Shell liest Wert korrekt" || bad "Shell liest Wert korrekt"

# Leerer Wert / mehrzeilig
printf '  \n' | "$SCRIPT" --stdin .env X >/dev/null 2>&1 && bad "leer abgelehnt" || ok "leer abgelehnt"
printf 'a\nb' | "$SCRIPT" --stdin .env X >/dev/null 2>&1 && bad "mehrzeilig abgelehnt" || ok "mehrzeilig abgelehnt"

# --check
printf 'A=val\nB=\nC=<your-key>\n' >.env
"$SCRIPT" --check .env A >/dev/null && ok "check SET" || bad "check SET"
"$SCRIPT" --check .env B >/dev/null && bad "check EMPTY" || ok "check EMPTY"
"$SCRIPT" --check .env C >/dev/null && bad "check Platzhalter" || ok "check Platzhalter"
"$SCRIPT" --check .env D >/dev/null && bad "check MISSING" || ok "check MISSING"
"$SCRIPT" --check .env A | grep -q val && bad "check gibt Wert aus" || ok "check gibt Wert nicht aus"

# --no-overwrite
printf 'z' | "$SCRIPT" --stdin --no-overwrite .env A >/dev/null 2>&1 && bad "no-overwrite" || ok "no-overwrite"
printf 'z' | "$SCRIPT" --stdin --no-overwrite .env C >/dev/null 2>&1 && ok "no-overwrite ersetzt Platzhalter" || bad "no-overwrite ersetzt Platzhalter"

# Ungültiger Key
printf 'z' | "$SCRIPT" --stdin .env '1BAD' >/dev/null 2>&1 && bad "ungültiger Key" || ok "ungültiger Key abgelehnt"

# Ohne TTY
"$SCRIPT" .env K </dev/null >/dev/null 2>&1 && bad "ohne TTY" || ok "ohne TTY sauberer Fehler"

# ---------------- Platzhalter-Modus
cat >cfg.json <<'J'
{"api": {"token": "__PASTE_SECRET_TOKEN__", "other": 1}}
J
printf '%s' 'a"b\c' | "$SCRIPT" --stdin --placeholder __PASTE_SECRET_TOKEN__ cfg.json >out 2>&1
[ "$(cat cfg.json)" = '{"api": {"token": "a\"b\\c", "other": 1}}' ] && ok "json auto-escape" || { bad "json auto-escape"; cat cfg.json; }
if command -v python3 >/dev/null; then python3 -c 'import json,sys; assert json.load(open("cfg.json"))["api"]["token"]=="a\"b\\c"' 2>/dev/null && ok "json gültig" || bad "json gültig"; fi
grep -q 'a"b' out && bad "Wert in Ausgabe (placeholder)" || ok "Wert nicht in Ausgabe (placeholder)"
"$SCRIPT" --check --placeholder __PASTE_SECRET_TOKEN__ cfg.json >/dev/null && ok "check DONE" || bad "check DONE"

printf 'url: postgres://u:__PW__@h/db\nb: __PW__\n' >c.yaml
"$SCRIPT" --check --placeholder __PW__ c.yaml >/dev/null && bad "check PENDING" || ok "check PENDING"
printf 'p@ss/w:rd ü' | "$SCRIPT" --stdin --placeholder __PW__ --escape url c.yaml >/dev/null
[ "$(cat c.yaml)" = "$(printf 'url: postgres://u:p%%40ss%%2Fw%%3Ard%%20%%C3%%BC@h/db\nb: p%%40ss%%2Fw%%3Ard%%20%%C3%%BC')" ] && ok "url-escape, mehrfach ersetzt" || { bad "url-escape"; cat c.yaml; }

printf 'TOKEN=__X__\n' >run.sh
printf "it's \$x" | "$SCRIPT" --stdin --placeholder __X__ --escape shell run.sh >/dev/null 2>&1
[ "$(sh -c '. ./run.sh; printf %s "$TOKEN"')" = "it's \$x" ] && ok "shell-escape" || { bad "shell-escape"; cat run.sh; }

printf -- '-----BEGIN KEY-----\nabc\n-----END KEY-----\n' >pemsrc
printf 'key: |\n  __K__\n' >k.txt
"$SCRIPT" --stdin --placeholder __K__ --escape none k.txt <pemsrc >/dev/null && grep -q 'END KEY' k.txt && ok "mehrzeilig raw" || bad "mehrzeilig raw"
"$SCRIPT" --stdin .env MULTI <pemsrc >/dev/null 2>&1 && bad "mehrzeilig dotenv abgelehnt" || ok "mehrzeilig dotenv abgelehnt"

printf 'x\n' >none.txt
printf 'v' | "$SCRIPT" --stdin --placeholder __NOPE__ none.txt >/dev/null 2>&1 && bad "fehlender Platzhalter" || ok "fehlender Platzhalter abgelehnt"
chmod 644 none.txt; printf 'a __M__\n' >none.txt
printf 'v' | "$SCRIPT" --stdin --placeholder __M__ none.txt >/dev/null 2>&1
[ "$(ls -l none.txt | cut -c1-10)" = "-rw-r--r--" ] && ok "Rechte bleiben (placeholder)" || bad "Rechte bleiben"

ln -s .env link.env
printf 'L' | "$SCRIPT" --stdin link.env LINKED >/dev/null
[ -L link.env ] && grep -q '^LINKED=L$' .env && ok "Symlink bleibt erhalten" || bad "Symlink"

PASTE_SECRET_METHOD=stdin sh -c "printf q | '$SCRIPT' .env FROMENV" >/dev/null && grep -q '^FROMENV=q$' .env && ok "PASTE_SECRET_METHOD" || bad "PASTE_SECRET_METHOD"
"$SCRIPT" --info | grep -q '^available:.*stdin' && ok "--info" || bad "--info"

exit $fail
