# ttyd iOS Terminal - Development Log

> **Note:** This is the single documentation file for this project. All decisions, experiments, and learnings are logged here.

## Project Goal

Create an iOS Safari-friendly web terminal interface for ttyd that:
1. Shows terminal output properly
2. Allows typing/pasting text (iOS Safari paste menu workaround)
3. Provides control buttons (Ctrl+C, arrows, Tab, Enter, etc.)
4. Maintains persistent sessions via tmux

---

## The Core Problem

### iOS Safari + xterm.js Limitations

xterm.js (the standard web terminal library) has a **known, unsolved issue on iOS Safari**:
- Canvas-based terminals don't trigger iOS's native paste menu
- Touch selection doesn't work at all
- Copy with Cmd+C fails even with keyboard (paste works)
- **No official solution exists** - GitHub issue #3727 open since April 2022

Sources:
- https://github.com/xtermjs/xterm.js/issues/3727
- https://github.com/xtermjs/xterm.js/issues/30

### Our Workaround

Instead of trying to fix the paste menu (impossible), we:
1. Added a visible **text input field** where users can type/paste
2. Added **control buttons** for special keys
3. Use the input field's native iOS paste support

---

## Experiments & Decisions

### Attempt 1: Transparent Textarea Overlay

**Idea:** Put a transparent `<textarea>` on top of the xterm canvas so iOS sees a real input element.

**Code:**
```html
<textarea id="tap-input" style="opacity: 0; position: absolute; ..."></textarea>
```

**Result:** Failed. iOS still didn't reliably show paste menu. The overlay intercepted touches but didn't consistently trigger the paste popup.

**Decision:** Abandoned this approach.

---

### Attempt 2: Native ttyd in iframe + Control Buttons

**Idea:** Embed native ttyd (which works) in an iframe, add control buttons that send keystrokes via separate WebSocket.

**Code:**
```html
<iframe src="http://YOUR_TAILSCALE_IP:7681"></iframe>
<script>
// Separate WebSocket for control buttons
ws = new WebSocket('ws://YOUR_TAILSCALE_IP:7681/ws');
</script>
```

**Result:** Failed. The iframe creates its own WebSocket session. Control button WebSocket creates a DIFFERENT session. Keystrokes go to wrong terminal.

**Decision:** Cannot use iframe approach - must use single WebSocket.

---

### Attempt 3: Custom xterm.js Client (Wrong Protocol)

**Idea:** Build custom HTML with xterm.js, connect to ttyd WebSocket directly.

**Initial Code:**
```javascript
// WRONG - used numeric bytes
msg[0] = 0; // input
msg[0] = 2; // resize
```

**Result:** WebSocket connected but immediately disconnected. No terminal output.

**Discovery:** ttyd uses **ASCII character codes**, not numeric bytes:
- INPUT: `'0'` = ASCII 48 (0x30)
- RESIZE: `'1'` = ASCII 49 (0x31)
- OUTPUT: `'0'` = ASCII 48 (server to client)

**Fix:**
```javascript
msg[0] = 48; // '0' ASCII for INPUT
msg[0] = 49; // '1' ASCII for RESIZE
```

Sources:
- https://github.com/tsl0922/ttyd/blob/main/src/server.h
- https://moebuta.org/posts/porting-ttyd-to-golang-part-i/

---

### Attempt 4: Missing Auth Token

**Problem:** Even with correct message types, WebSocket still disconnected quickly.

**Discovery:** ttyd requires an **authentication handshake** on WebSocket open:

1. Client fetches `/token` endpoint
2. Client sends `{"AuthToken": "..."}` as first WebSocket message
3. Only then does ttyd accept input/output

**Fix:**
```javascript
ws.onopen = () => {
    const authMsg = JSON.stringify({ AuthToken: authToken });
    ws.send(encoder.encode(authMsg));
};
```

Sources:
- https://github.com/tsl0922/ttyd/blob/c8e981500bdce6eea9a768ba21c6030b6319ceb4/html/js/app.js

---

### Attempt 5: CORS Blocking

**Problem:** WebSocket connects, process starts, but no output displayed.

**Discovery:** Browser blocks cross-origin requests:
- HTML served from port 7682 (nginx)
- Trying to fetch `/token` and connect WebSocket to port 7681 (ttyd)
- Different ports = different origins = CORS block

**Solution:** Configure nginx to proxy everything on port 7682:

```nginx
server {
    listen YOUR_TAILSCALE_IP:7682;

    location = / {
        root /var/www/ttyd;
        index index.html;
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

Now the HTML uses same-origin requests:
```javascript
const TTYD_HOST = window.location.hostname;
const TTYD_PORT = window.location.port || 7682;
```

---

### Attempt 6: Nginx Location Exact Match Issue

**Problem:** After CORS fix, nginx showed default "Welcome to nginx!" page instead of our HTML.

**Discovery:** `location = /` is an **exact match** - only matches exactly `/`, not `/index.html` or any other path. Something in nginx was catching requests before our config.

**Fix:** Changed from exact match to prefix match with `try_files`:

```nginx
# WRONG - exact match only
location = / {
    root /var/www/ttyd;
    index index.html;
}

# CORRECT - handles all paths
location / {
    try_files $uri $uri/ /index.html;
}
```

**Final working nginx config:**
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

---

## Current Status

**Working:**
- Port 7681: Native ttyd interface (works on desktop, limited on iOS)
- Port 7682: Custom interface served, nginx proxying configured

**Testing:**
- Need to verify terminal output displays on port 7682
- Need to verify input field and control buttons work

---

## Closed-Loop Debug (2026-01-13)

### Goal
Verify iOS-friendly UI on `http://YOUR_TAILSCALE_IP:7682` in iOS Safari:
- terminal output renders
- input field sends text
- control buttons work

### What I Tried
1. iOS simulator → Safari → `http://YOUR_TAILSCALE_IP:7682`
   - UI loaded, but terminal area blank (no output).
2. Local protocol probe:
   - `GET /token` returned `{"token": ""}` (expected with `-a`).
   - WebSocket open succeeded but no output.
3. Compared with ttyd's bundled client:
   - Found it uses WebSocket subprotocol `["tty"]`.
   - Found auth message includes `{AuthToken, columns, rows}` in **one** JSON payload.

### Fixes Applied
1. **WebSocket subprotocol**
   - `new WebSocket(url, ["tty"])` required.
2. **Auth + initial size payload**
   - On open: send JSON `{AuthToken, columns, rows}`.
3. **Same-origin + protocol**
   - Use `window.location.origin` for `/token`.
   - Use `ws/wss` based on `window.location.protocol`.
4. **UI layout (safe area)**
   - Add `env(safe-area-inset-bottom)` to avoid overlapping buttons.
   - Controls row tightened so `Tab` + `Enter` visible on iPhone.
5. **Input UX**
   - `autocapitalize="off" autocorrect="off" spellcheck="false"`.
6. **Font options**
   - Added a small `Aa` menu with 3 sizes (11/12/14).
   - Persisted via `localStorage` and triggers resize.
7. **Default directory + sessions**
   - Auto `cd /root/code` on connect.
   - Sidebar to switch sessions (tmux), create new, or fresh reset.
8. **Extra controls toggle**
   - Sidebar toggle shows extra row (session prev/next, rename, PgUp/PgDn, Home/End).
9. **Session naming**
   - New session default name: `<host>-<timestamp>-server-skill`.
   - Rename current session from extra controls.
10. **Sidebar discoverability**
   - Added visible ≡ handle on right edge + first-run hint pill.
   - Sidebar panel now slides in from the right.
   - Right-edge touch opens panel as fallback.
11. **Terminate session**
   - Extra controls include a “Terminate” button with confirm prompt.
   - Switches client to `main`, then kills selected session.
12. **AI naming + sidebar glance**
   - Optional non-blocking POST to user-defined naming endpoint after a few commands.
   - Sidebar shows 3-word display name + “time ago” + last `cd` directory.
   - Endpoint field hidden behind a `?` panel in sidebar.
13. **Sidebar IO snippets**
   - Shows last input and last output line for quick glance.

### Deployment
```bash
scp ttyd-index.html root@YOUR_TAILSCALE_IP:/var/www/ttyd/index.html
```

### Closed-Loop Result (Simulator)
- Terminal output visible.
- Input field `Send` works; command appears in ttyd.
- `Enter` button now visible and triggers terminal response.

### Remaining Caveat
Simulator cannot run Tailscale. Must use:
- Mac Tailscale on host (simulator routes through host), or
- Real iPhone with Tailscale app.

---

## ttyd WebSocket Protocol Summary

### Message Types (Client → Server)
| Type | Byte | Description |
|------|------|-------------|
| INPUT | `'0'` (48) | Send keystrokes to terminal |
| RESIZE | `'1'` (49) | Send terminal dimensions as JSON |

### Message Types (Server → Client)
| Type | Byte | Description |
|------|------|-------------|
| OUTPUT | `'0'` (48) | Terminal output data |
| SET_WINDOW_TITLE | `'1'` (49) | Window title string |
| SET_PREFERENCES | `'2'` (50) | Preferences JSON |

### Connection Flow
1. `GET /token` → `{"token": "..."}`
2. Connect WebSocket to `/ws` **with subprotocol** `["tty"]`
3. On open, send **one JSON message**: `{"AuthToken":"...","columns":N,"rows":M}`
4. After that, send resize messages as needed: `'1' + JSON({"columns": N, "rows": M})`
5. Exchange input/output messages

### Message Format
```
[1 byte type][payload bytes]
```

Example input "hello":
```
[48][104][101][108][108][111]
 '0'  h    e    l    l    o
```

### Required WebSocket Subprotocol
Use `new WebSocket(url, ["tty"])`. Without the `tty` subprotocol, the connection opens but no output arrives.

---

## Persistent Sessions with tmux

### Problem
Each ttyd WebSocket connection spawns a new shell process. Closing browser = losing session.

### Solution
ttyd runs a wrapper script that attaches to tmux:

```bash
#!/bin/bash
# /usr/local/bin/ttyd-session.sh
tmux attach-session -t main 2>/dev/null || tmux new-session -s main
```

Start ttyd with:
```bash
ttyd -W -i YOUR_TAILSCALE_IP -p 7681 /usr/local/bin/ttyd-session.sh
```

Now:
- First connection creates tmux session "main"
- Subsequent connections attach to existing session
- Closing browser leaves tmux running
- Reconnecting shows previous state

---

## File Structure

```
ttyd-ios-terminal/
├── ttyd-index.html      # Custom web interface
├── ttyd-session.sh      # tmux wrapper script
├── README.md            # User documentation
├── docs/
│   └── DEVELOPMENT.md   # This file (all dev docs here)
└── .claude/
    └── settings.json    # Claude Code settings
```

---

## Server Setup Commands

### Start ttyd
```bash
ttyd -W -a -i YOUR_TAILSCALE_IP -p 7681 -t fontSize=16 /usr/local/bin/ttyd-session.sh
```

Flags:
- `-W`: Writable (allow input)
- `-a`: Allow all clients
- `-i IP`: Bind to specific IP (Tailscale)
- `-p PORT`: Listen port
- `-t fontSize=N`: Terminal font size

### Deploy Custom Interface
```bash
# Upload HTML
scp ttyd-index.html root@YOUR_TAILSCALE_IP:/var/www/ttyd/index.html

# Reload nginx
ssh root@YOUR_TAILSCALE_IP "nginx -t && systemctl reload nginx"
```

### Check Logs
```bash
ssh root@YOUR_TAILSCALE_IP "tail -50 /var/log/ttyd.log"
```

---

## URLs

| URL | Description |
|-----|-------------|
| `http://YOUR_TAILSCALE_IP:7681` | Native ttyd interface |
| `http://YOUR_TAILSCALE_IP:7682` | Custom iOS-friendly interface |

---

## Known Limitations

1. **No native iOS paste menu in terminal area** - Must use the text input field
2. **New WebSocket = new ttyd process** - But tmux makes this transparent
3. **Font size fixed** - Configured at ttyd startup, not runtime

---

## Future Improvements

- [ ] Add clipboard button that reads from `navigator.clipboard.readText()`
- [ ] Add "Copy" button to copy selected terminal text
- [ ] Theme customization
- [ ] Multiple tmux session support
- [ ] Reconnection indicator in UI

---

## Date

Created: 2026-01-13
