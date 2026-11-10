// -----------------------------------------------------------------------------
// Client of the OpenAI speech API, and of the servers that copy it (Kokoro-
// FastAPI, LocalAI, Speaches, openedai-speech…):
//
//   POST <base>/audio/speech   {model, input, voice, response_format, speed?, instructions?}
//        -> the audio bytes
//   GET  <base>/models         -> {data: [{id}]}  (OpenAI, Kokoro-FastAPI, LocalAI…)
//   GET  <base>/audio/voices   -> {voices: [...]} (Kokoro-FastAPI only; 404 elsewhere)
//
// Only the fields of the OpenAI API are sent: OpenAI refuses unknown ones. The
// text and the key never reach a log line or an error message.
// -----------------------------------------------------------------------------

import { sniffAudio } from '../audio.js';

// Gladys waits 30 s for the clip: keep a margin for the relay.
export const SPEECH_TIMEOUT_MS = 25_000;
// A model or voice list, or the periodic check.
export const LIST_TIMEOUT_MS = 10_000;
// Longest server message kept in an error (a FastAPI detail can be long).
const MAX_DETAIL = 160;

export class SpeechError extends Error {
  /**
   * @param {'not_configured'|'unreachable'|'timeout'|'auth'|'not_found'|'rejected'|'rate_limited'|'server'|'invalid_response'|'empty'} kind - What failed.
   * @param {string} message - Technical detail, for the logs.
   * @param {{status?: number, detail?: string, cause?: unknown}} [options]
   */
  constructor(kind, message, { status, detail, cause } = {}) {
    super(message, { cause });
    this.name = 'SpeechError';
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The message of an error body: OpenAI's `{error: {message}}`, FastAPI's
 * `{detail}` (a text, `{message}`, or a list of `{msg}`, whose `input` is
 * never read: it may echo the text spoken).
 * @param {Buffer} body - The answer.
 * @returns {string} The message, shortened, or ''.
 */
export function errorDetail(body) {
  let json;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch {
    return '';
  }
  const detail = json?.detail;
  const candidates = [
    json?.error?.message,
    typeof json?.error === 'string' ? json.error : null,
    typeof detail === 'string' ? detail : null,
    detail?.message,
    Array.isArray(detail)
      ? detail
          .map((item) => item?.msg)
          .filter(Boolean)
          .join('; ')
      : null,
    json?.message,
  ];
  const found = candidates.find((value) => typeof value === 'string' && value.trim() !== '');
  if (!found) {
    return '';
  }
  // OpenAI quotes the start and end of a refused key: never keep it.
  const flat = found
    .replace(/\bsk-\S*/g, 'sk-…')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

export class OpenAiSpeechClient {
  /**
   * @param {object} [deps]
   * @param {typeof fetch} [deps.fetch] - Injectable for tests.
   * @param {number} [deps.speechTimeoutMs] - Bound of one synthesis.
   * @param {number} [deps.listTimeoutMs] - Bound of a list request.
   */
  constructor({
    fetch: fetchImpl = globalThis.fetch,
    speechTimeoutMs = SPEECH_TIMEOUT_MS,
    listTimeoutMs = LIST_TIMEOUT_MS,
  } = {}) {
    this.fetch = fetchImpl;
    this.speechTimeoutMs = speechTimeoutMs;
    this.listTimeoutMs = listTimeoutMs;
  }

  /**
   * One request to the API.
   * @param {{baseUrl: string|null, apiKey: string}} server - Where, and the key.
   * @param {string} path - `/audio/speech`, `/models`…
   * @param {{body?: object, timeoutMs: number}} options - The JSON body (POST), and the bound.
   * @returns {Promise<{response: Response, body: Buffer}>} A 2xx answer.
   * @throws {SpeechError} On any failure.
   */
  async request({ baseUrl, apiKey }, path, { body, timeoutMs }) {
    if (!baseUrl) {
      throw new SpeechError('not_configured', 'no server address configured');
    }
    const headers = { Accept: body ? 'audio/*, application/json' : 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let data;
    try {
      response = await this.fetch(`${baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Inside the try: the timeout also covers a body that stalls.
      data = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new SpeechError('timeout', `${path}: no answer within ${timeoutMs} ms`, {
          cause: err,
        });
      }
      const reason = err?.cause?.code ?? err?.message ?? String(err);
      throw new SpeechError('unreachable', `${path}: request failed (${reason})`, { cause: err });
    }
    if (!response.ok) {
      const { status } = response;
      const detail = errorDetail(data);
      const kind =
        status === 401 || status === 403
          ? 'auth'
          : status === 404
            ? 'not_found'
            : status === 429
              ? 'rate_limited'
              : status >= 500
                ? 'server'
                : 'rejected';
      const suffix = detail ? `: ${detail}` : '';
      throw new SpeechError(kind, `${path}: HTTP ${status}${suffix}`, { status, detail });
    }
    return { response, body: data };
  }

  /**
   * Speak a text.
   * @param {{baseUrl: string|null, apiKey: string, model: string, voice: string, format: string, speed: number, instructions?: string}} request - The settings of the request.
   * @param {string} text - What to say.
   * @returns {Promise<{audio: Buffer, type: string}>} The clip and its content type.
   * @throws {SpeechError} On any failure.
   * @example
   * await client.speak({ baseUrl, apiKey: '', model: 'kokoro', voice: 'ff_siwis', format: 'mp3', speed: 1 }, 'Bonjour.');
   */
  async speak(request, text) {
    const { model, voice, format, speed, instructions } = request;
    const body = { model, input: text, voice, response_format: format };
    // Sent only when they say something: not every server knows them.
    if (speed !== 1) {
      body.speed = speed;
    }
    if (instructions) {
      body.instructions = instructions;
    }
    const { response, body: audio } = await this.request(request, '/audio/speech', {
      body,
      timeoutMs: this.speechTimeoutMs,
    });
    const type = sniffAudio(audio);
    if (!type) {
      const announced = response.headers.get('content-type') ?? 'no content type';
      throw new SpeechError(
        'invalid_response',
        `/audio/speech: expected audio, got "${announced}" (${audio.length} bytes)`,
      );
    }
    return { audio, type };
  }

  /**
   * The models the server lists, or null when it lists none (404).
   * @param {{baseUrl: string|null, apiKey: string}} server - Where, and the key.
   * @returns {Promise<string[]|null>} The model ids.
   * @throws {SpeechError} When the server does not answer, or refuses the key.
   */
  async models(server) {
    const json = await this.listRequest(server, '/models');
    if (json === null) {
      return null;
    }
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    return data.map((model) => (typeof model === 'string' ? model : model?.id)).filter(Boolean);
  }

  /**
   * The voices the server lists (Kokoro-FastAPI), or null when it has no such
   * list (OpenAI, LocalAI…).
   * @param {{baseUrl: string|null, apiKey: string}} server - Where, and the key.
   * @returns {Promise<string[]|null>} The voice names.
   * @throws {SpeechError} When the server does not answer, or refuses the key.
   */
  async voices(server) {
    const json = await this.listRequest(server, '/audio/voices');
    if (json === null) {
      return null;
    }
    const voices = Array.isArray(json?.voices) ? json.voices : Array.isArray(json) ? json : null;
    if (!voices) {
      return null;
    }
    return voices
      .map((voice) => (typeof voice === 'string' ? voice : (voice?.id ?? voice?.name)))
      .filter((voice) => typeof voice === 'string' && voice !== '');
  }

  /**
   * A GET answered in JSON; null when the server has no such endpoint.
   * @param {{baseUrl: string|null, apiKey: string}} server - Where, and the key.
   * @param {string} path - The endpoint.
   * @returns {Promise<unknown|null>} The JSON.
   * @throws {SpeechError} Any failure other than 404 or 405.
   */
  async listRequest(server, path) {
    let body;
    try {
      ({ body } = await this.request(server, path, { timeoutMs: this.listTimeoutMs }));
    } catch (err) {
      if (err.kind === 'not_found' || err.status === 405) {
        return null;
      }
      throw err;
    }
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return null;
    }
  }
}
