# ttyd iOS Terminal

A custom iOS-friendly web terminal interface for [ttyd](https://github.com/tsl0922/ttyd) with control buttons and persistent sessions via tmux.

## Why?

The default ttyd interface works great on desktop but has issues on iOS:
- **No paste menu**: Canvas-based terminals don't trigger iOS's native paste popup
- **No control keys**: Can't send Ctrl+C, arrow keys, etc. without a physical keyboard
- **Sessions lost**: Closing Safari kills the terminal session

This project solves all three.

## Features

- **iOS paste support**: Transparent textarea overlay triggers native iOS paste menu
- **Control buttons**: ^C, ^D, ^Z, Esc, arrows, Tab, Enter - all tappable
- **Persistent sessions**: tmux wrapper keeps sessions alive when browser closes
- **Responsive**: Works on iPhone, iPad, and desktop browsers

## Files

| File | Description |
|------|-------------|
| `ttyd-index.html` | Custom web interface with xterm.js and control buttons |
| `ttyd-session.sh` | tmux wrapper script for persistent sessions |

## Installation

### macOS (one shot)

```bash
chmod +x setup-macos.sh
./setup-macos.sh
```

Then open `http://localhost:7682`.

If you want local-only on your Mac, use the section above.  
If you want a public server setup, jump to **Server (rented VPS)** below.

### Server (rented VPS)

```bash
# Install deps
sudo apt update
sudo apt install -y ttyd tmux nginx

# Deploy UI
sudo mkdir -p /var/www/ttyd
sudo cp ttyd-index.html /var/www/ttyd/index.html
sudo cp ttyd-session.sh /usr/local/bin/ttyd-session.sh
sudo chmod +x /usr/local/bin/ttyd-session.sh

# Start ttyd (bind to Tailscale IP or localhost)
ttyd -W -a -i YOUR_TAILSCALE_IP -p 7681 /usr/local/bin/ttyd-session.sh
```

Nginx (same-origin proxy):

```nginx
server {
    listen YOUR_TAILSCALE_IP:7682;
    root /var/www/ttyd;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /token {
        proxy_pass http://YOUR_TAILSCALE_IP:7681/token;
    }

    location /ws {
        proxy_pass http://YOUR_TAILSCALE_IP:7681/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

Reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Vultr + Tailscale (brief):**
- Create a Vultr Ubuntu instance.
- Install Tailscale, authenticate, and note the Tailscale IP.
- Bind ttyd/nginx to the Tailscale IP; access only over Tailscale.

### 1. Install ttyd on your server

```bash
# Ubuntu/Debian
apt install ttyd

# Or build from source
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake .. && make && sudo make install
```

### 2. Install tmux

```bash
apt install tmux
```

### 3. Deploy the session wrapper

```bash
sudo cp ttyd-session.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/ttyd-session.sh
```

### 4. Serve the custom interface

Option A: Use nginx to serve the HTML on a different port:

```bash
# Copy HTML to web root
sudo mkdir -p /var/www/ttyd
sudo cp ttyd-index.html /var/www/ttyd/index.html

# Add nginx config (adjust IP/port as needed)
cat <<'EOF' | sudo tee /etc/nginx/sites-available/ttyd
server {
    listen 7682;
    root /var/www/ttyd;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ttyd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Option B: Just use the HTML file locally and point it at your ttyd server.

### 5. Start ttyd with tmux wrapper

```bash
# Bind to localhost only (recommended - use VPN/tunnel for remote access)
ttyd -W -p 7681 /usr/local/bin/ttyd-session.sh

# Or bind to specific IP
ttyd -W -i YOUR_IP -p 7681 /usr/local/bin/ttyd-session.sh
```

### 6. Update the WebSocket URL

Edit `ttyd-index.html` and change the WebSocket URL to match your server:

```javascript
ws = new WebSocket('ws://YOUR_SERVER_IP:7681/ws');
```

## Usage

1. Open `http://YOUR_SERVER:7682` in Safari on iOS
2. Tap the terminal area to bring up the keyboard
3. Tap and hold to trigger the paste menu
4. Use the control buttons at the bottom for special keys
5. Close the browser anytime - your session persists in tmux
6. Reopen the URL to reconnect to your session

## Security Notes

- **Don't expose to public internet** - ttyd gives shell access
- Use Tailscale, WireGuard, or SSH tunnel for remote access
- The `-W` flag enables WebSocket auth (recommended)

## How It Works

### iOS Paste Fix
iOS Safari only shows the paste menu for native input elements, not canvas. The interface overlays a transparent `<textarea>` on top of the terminal. When you tap, iOS sees the textarea and offers paste.

### Persistent Sessions
Instead of running bash directly, ttyd runs `ttyd-session.sh` which attaches to an existing tmux session or creates one. When you disconnect, tmux keeps running. Reconnecting reattaches to the same session.

### Control Buttons
The buttons at the bottom send the appropriate escape sequences:
- `^C` → `\x03` (interrupt)
- `^D` → `\x04` (EOF)
- `↑` → `\x1b[A` (up arrow)
- etc.

## License

MIT
