#!/usr/bin/env node
import http from 'http';
import { URL } from 'url';

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

server.listen(PORT, () => {
  console.log(`Deepgram transcribe server on :${PORT}`);
});
