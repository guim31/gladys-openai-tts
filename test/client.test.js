import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OpenAiSpeechClient, errorDetail } from '../src/openai/client.js';
import { CLIPS, fakeServer, json } from './helpers/fakeServer.js';

const fixture = (path) => readFile(new URL(`./fixtures/${path}`, import.meta.url));
const BASE = 'http://192.0.2.10:8880/v1';
const request = (overrides = {}) => ({
  baseUrl: BASE,
  apiKey: '',
  model: 'kokoro',
  voice: 'ff_siwis',
  format: 'mp3',
  speed: 1,
  instructions: '',
  ...overrides,
});

test('a speech request carries only the fields of the OpenAI API', async () => {
  const fetch = fakeServer();
  const clip = await new OpenAiSpeechClient({ fetch }).speak(request(), 'Bonjour.');
  assert.equal(clip.type, 'audio/mpeg');
  assert.deepEqual(clip.audio, CLIPS.mp3);
  const [call] = fetch.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url.href, `${BASE}/audio/speech`);
  assert.deepEqual(call.body, {
    model: 'kokoro',
    input: 'Bonjour.',
    voice: 'ff_siwis',
    response_format: 'mp3',
  });
  assert.equal(call.headers.Authorization, undefined);
  assert.ok(call.signal instanceof AbortSignal);
});

test('speed, style and key are sent when set', async () => {
  const fetch = fakeServer();
  await new OpenAiSpeechClient({ fetch }).speak(
    request({ apiKey: 'sk-test', speed: 1.25, instructions: 'Calmly.', format: 'opus' }),
    'Hello.',
  );
  const [call] = fetch.calls;
  assert.equal(call.body.speed, 1.25);
  assert.equal(call.body.instructions, 'Calmly.');
  assert.equal(call.headers.Authorization, 'Bearer sk-test');
});

test('the content type comes from the bytes: Kokoro labels Opus "audio/opus"', async () => {
  const fetch = fakeServer();
  const client = new OpenAiSpeechClient({ fetch });
  assert.equal((await client.speak(request({ format: 'opus' }), 'Yes.')).type, 'audio/ogg');
  assert.equal((await client.speak(request({ format: 'aac' }), 'Yes.')).type, 'audio/aac');
  assert.equal((await client.speak(request({ format: 'wav' }), 'Yes.')).type, 'audio/wav');
});

test('the real errors of Kokoro-FastAPI keep their message, never the text', async () => {
  const cases = [
    ['kokoro/error-unknown-voice.json', 400, 'rejected', /Voice 'zz_nobody' not found/],
    ['kokoro/error-unknown-model.json', 400, 'rejected', /Unsupported model: nope/],
    ['kokoro/error-validation.json', 422, 'rejected', /Input should be a valid string/],
    ['openai/error-invalid-key.json', 401, 'auth', /Incorrect API key/],
    ['openai/error-insufficient-quota.json', 429, 'rate_limited', /exceeded your current quota/],
  ];
  for (const [file, status, kind, message] of cases) {
    const body = await fixture(file);
    const fetch = fakeServer({ '/v1/audio/speech': () => json(body, status) });
    const err = await new OpenAiSpeechClient({ fetch })
      .speak(request(), 'Secret text 12')
      .catch((e) => e);
    assert.equal(err.kind, kind, file);
    assert.equal(err.status, status);
    assert.match(err.message, message);
    assert.doesNotMatch(err.message, /Secret text/);
  }
});

test('a FastAPI validation error never shows the echoed input', () => {
  const body = Buffer.from(
    JSON.stringify({ detail: [{ msg: 'Field required', input: { input: 'Mon code 1234' } }] }),
  );
  assert.equal(errorDetail(body), 'Field required');
  assert.equal(errorDetail(Buffer.from('<html>502</html>')), '');
  const key = Buffer.from(
    '{"error":{"message":"Incorrect API key provided: sk-abc***xyz. See docs."}}',
  );
  assert.equal(errorDetail(key), 'Incorrect API key provided: sk-… See docs.');
  assert.ok(errorDetail(Buffer.from(JSON.stringify({ detail: 'x'.repeat(500) }))).length <= 160);
});

test('server failures, missing address, timeouts and non-audio answers have their kind', async () => {
  const speak = (routes, overrides) =>
    new OpenAiSpeechClient({ fetch: fakeServer(routes), speechTimeoutMs: 50 })
      .speak(request(overrides), 'Hi.')
      .catch((e) => e);
  assert.equal((await speak({ '/v1/audio/speech': () => json('{}', 503) })).kind, 'server');
  assert.equal((await speak({ '/v1/audio/speech': () => json('{}', 404) })).kind, 'not_found');
  assert.equal((await speak({}, { baseUrl: null })).kind, 'not_configured');
  const notAudio = await speak({ '/v1/audio/speech': () => json('{"ok":true}') });
  assert.equal(notAudio.kind, 'invalid_response');
  assert.match(notAudio.message, /application\/json/);
  const refused = await speak({
    '/v1/audio/speech': () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    },
  });
  assert.equal(refused.kind, 'unreachable');
  assert.match(refused.message, /ECONNREFUSED/);
  const slow = await speak({
    '/v1/audio/speech': (call) =>
      new Promise((_, reject) => {
        // AbortSignal.timeout does not keep the event loop alive (Node 22).
        const alive = setTimeout(() => {}, 5000);
        call.signal.addEventListener('abort', () => {
          clearTimeout(alive);
          reject(call.signal.reason);
        });
      }),
  });
  assert.equal(slow.kind, 'timeout');
});

test('model and voice lists: Kokoro-FastAPI has both, OpenAI only models', async () => {
  const kokoro = new OpenAiSpeechClient({ fetch: fakeServer() });
  assert.deepEqual(await kokoro.models(request()), [
    'tts-1',
    'tts-1-hd',
    'kokoro',
    'gpt-4o-mini-tts',
  ]);
  const voices = await kokoro.voices(request());
  assert.equal(voices.length, 72);
  assert.ok(voices.includes('ff_siwis'));

  const openaiModels = await fixture('openai/models.json');
  const openai = new OpenAiSpeechClient({
    fetch: fakeServer({ '/v1/models': () => json(openaiModels), '/v1/audio/voices': undefined }),
  });
  assert.ok((await openai.models(request())).includes('gpt-4o-mini-tts'));
  assert.equal(await openai.voices(request()), null);

  const refused = new OpenAiSpeechClient({
    fetch: fakeServer({ '/v1/models': () => json('{}', 401) }),
  });
  assert.equal((await refused.models(request()).catch((e) => e)).kind, 'auth');
});
