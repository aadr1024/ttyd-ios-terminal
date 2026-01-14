# Deepgram Transcribe Server

Minimal server for `/transcribe` used by the mic button.

## Run

```bash
export DEEPGRAM_API_KEY=sk-REPLACE
export DEEPGRAM_MODEL=nova-2
npm install
node ./transcribe-server.js
```

Listens on `:8787` by default (override with `TRANSCRIBE_PORT`).
Supports `nova-2` and `nova-3` (client can override per request).
`nova-3` uses streaming via WebSocket `/transcribe-stream`.
