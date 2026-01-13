#!/bin/bash
# Attach to existing tmux session or create new one
tmux attach-session -t main 2>/dev/null || tmux new-session -s main
