#!/usr/bin/env node
import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.TRANSCRIBE_PORT || 8787);
const API_KEY = process.env.DEEPGRAM_API_KEY || '';
const MODEL = process.env.DEEPGRAM_MODEL || 'nova-2';
const ALLOWED_MODELS = new Set(['nova-2', 'nova-3']);
const MAX_BYTES = 12 * 1024 * 1024;

if (!API_KEY) {
  console.error('Missing DEEPGRAM_API_KEY');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/transcribe') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > MAX_BYTES * 1.5) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const { audio, mime, model } = JSON.parse(body || '{}');
      if (!audio || !mime) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing audio or mime' }));
        return;
      }
      const audioBuf = Buffer.from(audio, 'base64');
      if (audioBuf.length > MAX_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Audio too large' }));
        return;
      }
      if (!API_KEY) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server missing DEEPGRAM_API_KEY' }));
        return;
      }

      const url = new URL('https://api.deepgram.com/v1/listen');
      const selectedModel = ALLOWED_MODELS.has(model) ? model : MODEL;
      url.searchParams.set('model', selectedModel);
      url.searchParams.set('smart_format', 'true');

      const dg = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${API_KEY}`,
          'Content-Type': mime
        },
        body: audioBuf
      });
      const data = await dg.json();
      const text =
        data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Transcribe failed' }));
    }
  });
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/transcribe-stream')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (client, req) => {
  if (!API_KEY) {
    client.close(1011, 'Missing API key');
    return;
  }
  const url = new URL(req.url || '', 'http://localhost');
  const modelParam = url.searchParams.get('model') || MODEL;
  const selectedModel = ALLOWED_MODELS.has(modelParam) ? modelParam : MODEL;

  const dgUrl = new URL('wss://api.deepgram.com/v1/listen');
  dgUrl.searchParams.set('model', selectedModel);
  dgUrl.searchParams.set('smart_format', 'true');
  dgUrl.searchParams.set('interim_results', 'true');
  dgUrl.searchParams.set('encoding', 'opus');
  dgUrl.searchParams.set('sample_rate', '48000');
  dgUrl.searchParams.set('channels', '1');

  const dg = new WebSocket(dgUrl.toString(), {
    headers: { Authorization: `Token ${API_KEY}` }
  });

  dg.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  dg.on('close', () => {
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('message', (msg) => {
    if (dg.readyState === WebSocket.OPEN) {
      dg.send(msg);
    }
  });

  client.on('close', () => {
    if (dg.readyState === WebSocket.OPEN) dg.close();
  });
});

server.listen(PORT, () => {
  console.log(`Deepgram transcribe server on :${PORT}`);
});
