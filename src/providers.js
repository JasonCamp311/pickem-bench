// Model backends. Each takes chat messages and returns { text, usage, modelReported }.

import { parseExtras, parsePicks } from './prompt.js';

const TIMEOUT_MS = 10 * 60 * 1000;

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const backends = {
  openrouter: {
    ready: () => (process.env.OPENROUTER_API_KEY ? null : 'OPENROUTER_API_KEY is not set'),
    async call(model, messages) {
      const out = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'X-Title': 'pickem-bench' },
        { model: model.model, messages, response_format: { type: 'json_object' }, max_tokens: 16000, ...(model.options || {}) },
      );
      if (out.error) throw new Error(out.error.message || JSON.stringify(out.error));
      const choice = out.choices && out.choices[0];
      if (!choice || !choice.message || !choice.message.content) throw new Error('empty completion');
      return { text: choice.message.content, usage: out.usage || null, modelReported: out.model || null };
    },
  },

  ollama: {
    ready: () => null,
    async call(model, messages) {
      const host = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const out = await postJson(`${host}/api/chat`, {}, {
        model: model.model,
        messages,
        format: 'json',
        stream: false,
        think: false,
        options: model.options || {},
      });
      if (!out.message || !out.message.content) throw new Error('empty completion');
      return {
        text: out.message.content,
        usage: { prompt_tokens: out.prompt_eval_count ?? null, completion_tokens: out.eval_count ?? null },
        modelReported: out.model || null,
      };
    },
  },

  // Offline stand-in for tests and dry runs: home team by 3 in every game.
  mock: {
    ready: () => null,
    async call(model, messages) {
      const keys = [...messages[1].content.matchAll(/^GAME (\S+)/gm)].map((m) => m[1]);
      const picks = keys.map((game) => ({ game, away_score: 20, home_score: 23, confidence: 0.57, reason: 'mock' }));
      return { text: JSON.stringify({ picks }), usage: null, modelReported: 'mock' };
    },
  },
};

// One-off completion outside the pick loop (the fact checker uses it).
export function complete(model, messages) {
  return backends[model.provider].call(model, messages);
}

export function providerProblem(model) {
  const backend = backends[model.provider];
  if (!backend) return `unknown provider "${model.provider}"`;
  return backend.ready();
}

// Asks the model for the slate; an invalid reply gets the validation errors
// fed back, up to `attempts` times.
export async function runModel(model, prompt, games, attempts = 3) {
  const backend = backends[model.provider];
  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const reply = await backend.call(model, messages);
    try {
      const picks = parsePicks(reply.text, games);
      return { picks, ...parseExtras(reply.text, games), attempts: attempt, usage: reply.usage, modelReported: reply.modelReported, raw: reply.text };
    } catch (err) {
      lastErr = err;
      messages.push({ role: 'assistant', content: reply.text });
      messages.push({ role: 'user', content: `That reply was rejected: ${err.message}. Send the complete corrected JSON for every game.` });
    }
  }
  throw new Error(`invalid picks after ${attempts} attempts: ${lastErr.message}`);
}
