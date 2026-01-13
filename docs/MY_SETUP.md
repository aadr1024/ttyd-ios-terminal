# My Personal Setup (Template)

> **LOCAL ONLY** — Fill in your values locally. Do not commit personal IPs or secrets.

## URLs

| Purpose | URL |
|---------|-----|
| Native ttyd | http://YOUR_TAILSCALE_IP:7681 |
| Custom iOS interface | http://YOUR_TAILSCALE_IP:7682 |
| Syncthing GUI | http://YOUR_TAILSCALE_IP:8384 |

## Tailscale IPs

| Device | Tailscale IP |
|--------|--------------|
| Server | YOUR_TAILSCALE_IP |
| MacBook | YOUR_MAC_TAILSCALE_IP |
| iPhone | YOUR_IPHONE_TAILSCALE_IP |

## Server Details

| Property | Value |
|----------|-------|
| Provider | YOUR_PROVIDER |
| Public IP | YOUR_PUBLIC_IP |
| Region | YOUR_REGION |
| SSH | `ssh root@YOUR_TAILSCALE_IP` |

## Quick Commands

### SSH to server
```bash
ssh root@YOUR_TAILSCALE_IP
```

### Upload updated HTML
```bash
scp ttyd-index.html root@YOUR_TAILSCALE_IP:/var/www/ttyd/index.html
```

### Restart ttyd
```bash
ssh root@YOUR_TAILSCALE_IP "pkill ttyd; nohup ttyd -W -a -i YOUR_TAILSCALE_IP -p 7681 -t fontSize=16 /usr/local/bin/ttyd-session.sh > /var/log/ttyd.log 2>&1 &"
```

### Reload nginx
```bash
ssh root@YOUR_TAILSCALE_IP "nginx -t && systemctl reload nginx"
```

### Check ttyd logs
```bash
ssh root@YOUR_TAILSCALE_IP "tail -50 /var/log/ttyd.log"
```

### Check tmux sessions
```bash
ssh root@YOUR_TAILSCALE_IP "tmux list-sessions"
```

### Attach to tmux directly via SSH
```bash
ssh root@YOUR_TAILSCALE_IP -t "tmux attach -t main"
```

## Server File Locations

| File | Path |
|------|------|
| Custom HTML | /var/www/ttyd/index.html |
| tmux wrapper | /usr/local/bin/ttyd-session.sh |
| nginx config | /etc/nginx/sites-available/ttyd |
| ttyd log | /var/log/ttyd.log |

## How to Use from iPhone

1. Make sure Tailscale is connected on iPhone
2. Open Safari
3. Go to `http://YOUR_TAILSCALE_IP:7682`
4. Use the input field at bottom to type/paste text
5. Use control buttons for ^C, arrows, Tab, Enter
6. Session persists even if you close Safari

## Troubleshooting

### Can't connect?
- Check Tailscale is running: `tailscale status`
- Try public IP as fallback: `ssh root@YOUR_PUBLIC_IP`

### Terminal not responding?
- Check ttyd is running: `ssh root@YOUR_TAILSCALE_IP "pgrep -a ttyd"`
- Restart ttyd (see command above)

### Lost tmux session?
- Sessions should persist. Check: `ssh root@YOUR_TAILSCALE_IP "tmux list-sessions"`
- If no sessions, ttyd will create new one on next connect
