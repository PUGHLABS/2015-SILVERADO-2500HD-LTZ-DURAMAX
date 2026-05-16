/* server.js — Express server for Silverado maintenance record site */
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Static files ── */
app.use(express.static(__dirname));
app.use(express.json());

/* ── Load service manual text on startup ── */
const MANUAL_PATH = path.join(__dirname, 'extracted', 'service_manual.txt');
let manualText = '';

if (fs.existsSync(MANUAL_PATH)) {
  console.log('Loading service manual...');
  manualText = fs.readFileSync(MANUAL_PATH, 'utf8');
  console.log(`Service manual loaded: ${(manualText.length / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.warn('Warning: extracted/service_manual.txt not found. Run pdftotext first.');
}

/* ── Chunk-based keyword search ── */
const CHUNK_SIZE = 3000;   // characters per chunk
const MAX_CHUNKS = 4;      // max chunks to send to Claude

function findRelevantChunks(text, query) {
  if (!text) return [];

  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push({ offset: i, text: text.slice(i, i + CHUNK_SIZE) });
  }

  const scored = chunks.map(chunk => {
    const lower = chunk.text.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      let idx = 0;
      while ((idx = lower.indexOf(term, idx)) !== -1) {
        score++;
        idx += term.length;
      }
    }
    return { ...chunk, score };
  });

  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CHUNKS)
    .sort((a, b) => a.offset - b.offset)
    .map(c => c.text);
}

/* ── /api/chunks — returns relevant manual chunks as JSON (no API call) ── */
app.get('/api/chunks', (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (!query) return res.json({ chunks: [] });
  const chunks = findRelevantChunks(manualText, query);
  res.json({ chunks, total: manualText.length });
});

/* ── /api/search endpoint ── */
app.post('/api/search', async (req, res) => {
  const { query } = req.body || {};

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
  }

  const client = new Anthropic({ apiKey });

  const relevantChunks = findRelevantChunks(manualText, query);
  const hasManualContent = relevantChunks.length > 0;

  const systemPrompt = `You are a certified diesel mechanic specializing in 2015 Chevrolet Silverado 2500HD trucks with the 6.6L Duramax LB7 diesel engine and Allison 1000 automatic transmission. You have detailed knowledge of this truck's systems, maintenance requirements, torque specs, and repair procedures.

VIN: 1GC2KWE87FZ103781 — 2015 Chevrolet Silverado 2500HD LTZ Z71 — 6.6L Duramax — 141,145 miles

${hasManualContent
  ? `The following excerpts from the OEM service manual are relevant to the query:\n\n---\n${relevantChunks.join('\n\n---\n')}\n---\n\nUse these excerpts as your primary source. Cite specific procedures, torque specs, or part numbers when present.`
  : 'The service manual excerpt did not return results for this query. Use your expert knowledge of the 2015 Duramax Silverado 2500HD to answer accurately and precisely.'}

Always:
- Be concise and actionable
- Include torque specs and part numbers when relevant
- Note if something requires dealer-level equipment
- Flag if a repair would void the Endurance EA Premier warranty`;

  const userMessage = `Question about my 2015 Silverado 2500HD Duramax: ${query.trim()}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    res.write(`data: ${JSON.stringify({ type: 'source', hasManual: hasManualContent, chunks: relevantChunks.length })}\n\n`);

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

/* ── Health check ── */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    manualLoaded: manualText.length > 0,
    manualSize: `${(manualText.length / 1024 / 1024).toFixed(1)} MB`,
  });
});

app.listen(PORT, () => {
  console.log(`\n  Silverado Maintenance Record`);
  console.log(`  Running at: http://localhost:${PORT}\n`);
});
