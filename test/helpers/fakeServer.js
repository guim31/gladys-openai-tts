// A fetch that answers like Kokoro-FastAPI, from its real answers, and records
// every request. `routes` overrides an endpoint: `(call) => Response`.

import { readFile } from 'node:fs/promises';

const fixture = (path) => readFile(new URL(`../fixtures/${path}`, import.meta.url));

export const CLIPS = {
  mp3: await fixture('kokoro/oui-fr.mp3'),
  opus: await fixture('kokoro/yes-en.opus'),
  aac: await fixture('kokoro/yes-en.aac'),
  wav: await fixture('kokoro/yes-en.wav'),
};
export const KOKORO_MODELS = await fixture('kokoro/models.json');
export const KOKORO_VOICES = await fixture('kokoro/voices.json');

export const json = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } });

const TYPES = { mp3: 'audio/mpeg', opus: 'audio/opus', aac: 'audio/aac', wav: 'audio/wav' };

/** Kokoro-FastAPI's answer to a speech request. */
export function kokoroSpeech(call) {
  const format = call.body.response_format ?? 'mp3';
  return new Response(CLIPS[format], { status: 200, headers: { 'content-type': TYPES[format] } });
}

/**
 * @param {Record<string, (call: object) => Response|Promise<Response>>} [routes] - Answer per path.
 * @returns {typeof fetch & {calls: object[], speech: () => object[]}} The fake.
 */
export function fakeServer(routes = {}) {
  const answers = {
    '/v1/models': () => json(KOKORO_MODELS),
    '/v1/audio/voices': () => json(KOKORO_VOICES),
    '/v1/audio/speech': kokoroSpeech,
    ...routes,
  };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const call = {
      url: parsed,
      path: parsed.pathname,
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      body: init.body ? JSON.parse(init.body) : null,
      signal: init.signal,
    };
    calls.push(call);
    const answer = answers[call.path];
    return answer ? answer(call) : json('{"detail":"Not Found"}', 404);
  };
  fetch.calls = calls;
  fetch.speech = () => calls.filter((call) => call.path === '/v1/audio/speech');
  return fetch;
}

/** A logger that records, by level. */
export function recordingLogger() {
  const lines = { info: [], warn: [], debug: [], error: [] };
  const logger = Object.fromEntries(
    Object.keys(lines).map((level) => [level, (message) => lines[level].push(String(message))]),
  );
  return { logger, lines };
}
