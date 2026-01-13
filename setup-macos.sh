#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew required. Install from https://brew.sh/ and retry."
  exit 1
fi

brew install ttyd tmux caddy

chmod +x "$ROOT/ttyd-session.sh"

if pgrep -x ttyd >/dev/null 2>&1; then
  if [[ "${SKIP_KILL:-}" != "1" ]]; then
    pkill -x ttyd || true
  else
    echo "ttyd already running. Set SKIP_KILL=0 to stop it."
  fi
fi

cat > "$ROOT/Caddyfile" <<EOF
:7682 {
  root * $ROOT
  file_server
  reverse_proxy /token 127.0.0.1:7681
  reverse_proxy /ws 127.0.0.1:7681 {
    header_up Connection "upgrade"
    header_up Upgrade {>Upgrade}
  }
}
EOF

nohup ttyd -W -p 7681 "$ROOT/ttyd-session.sh" >/tmp/ttyd.log 2>&1 &
caddy stop >/dev/null 2>&1 || true
caddy start --config "$ROOT/Caddyfile" --adapter caddyfile

echo "Open http://localhost:7682"
