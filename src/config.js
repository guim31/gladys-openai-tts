// -----------------------------------------------------------------------------
// Configuration: defaults (mirrors the manifest), normalization, and the choice
// of the voice for the language of a request.
// -----------------------------------------------------------------------------

// Languages of the Gladys interface, the ones a voice can be set for.
export const LANGUAGES = ['fr', 'en', 'de', 'es'];

// Language spoken when Gladys gives none (an announcement on an instance
// without administrator): the default of Guilhem's integrations.
export const FALLBACK_LANGUAGE = 'fr';

// `speed` of the OpenAI API (0.25 to 4), offered as a list: the number fields
// of the Gladys forms accept integers only.
export const SPEEDS = ['0.75', '0.9', '1', '1.1', '1.25', '1.5'];

// `response_format` values Gladys can play: OpenAI's `opus` is Ogg Opus, `aac`
// is ADTS. `flac` and `pcm` exist in the API, Gladys refuses them.
export const FORMATS = ['mp3', 'opus', 'aac', 'wav'];

export const DEFAULT_CONFIG = Object.freeze({
  base_url: '',
  api_key: '',
  model: 'kokoro',
  voice_fr: 'ff_siwis',
  voice_en: 'af_heart',
  voice_de: '',
  voice_es: 'ef_dora',
  speed: '1',
  response_format: 'mp3',
  instructions: '',
});

const text = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

/**
 * The base URL of the API, as `http(s)://host[:port]/path` without a trailing
 * slash. A bare `host:port` gets `http://`, and an address without path gets
 * `/v1`, where every compatible server serves the API.
 * @param {unknown} value - What the administrator typed.
 * @returns {string|null} The URL, null when empty or invalid.
 * @example
 * normalizeBaseUrl('192.0.2.10:8880'); // 'http://192.0.2.10:8880/v1'
 */
export function normalizeBaseUrl(value) {
  let raw = text(value);
  if (raw === '') {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path === '' ? '/v1' : path}`;
}

/**
 * Normalize the raw configuration sent by Gladys: unknown values fall back to
 * the defaults. An empty voice stays empty: that language borrows another's.
 * @param {Record<string, unknown>} [raw] - Values from the configuration form.
 * @returns {{baseUrl: string|null, apiKey: string, model: string, voices: Record<string, string>, speed: number, format: string, instructions: string}} The settings.
 * @example
 * normalizeConfig({ base_url: 'kokoro.lan:8880' }).baseUrl; // 'http://kokoro.lan:8880/v1'
 */
export function normalizeConfig(raw = {}) {
  const value = raw ?? {};
  const voices = Object.fromEntries(
    LANGUAGES.map((lang) => [lang, text(value[`voice_${lang}`], DEFAULT_CONFIG[`voice_${lang}`])]),
  );
  const speed = SPEEDS.includes(String(value.speed)) ? String(value.speed) : DEFAULT_CONFIG.speed;
  return {
    baseUrl: normalizeBaseUrl(value.base_url),
    apiKey: text(value.api_key),
    model: text(value.model) || DEFAULT_CONFIG.model,
    voices,
    speed: Number(speed),
    format: FORMATS.includes(value.response_format)
      ? value.response_format
      : DEFAULT_CONFIG.response_format,
    instructions: text(value.instructions),
  };
}

/**
 * The language of a request, as one of LANGUAGES: `fr-FR`, `FR` and `fr_FR`
 * are `fr`; unknown or another language gives the fallback.
 * @param {unknown} language - Language Gladys sent, null when unknown.
 * @returns {string} A code of LANGUAGES.
 */
export function requestLanguage(language) {
  if (typeof language !== 'string') {
    return FALLBACK_LANGUAGE;
  }
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.includes(base) ? base : FALLBACK_LANGUAGE;
}

/**
 * The voice that speaks a language: its own, else the first one set, in the
 * order of LANGUAGES (French first).
 * @param {{voices: Record<string, string>}} settings - Normalized settings.
 * @param {string} language - A code of LANGUAGES.
 * @returns {string|null} The voice, null when none is set at all.
 * @example
 * voiceFor({ voices: { fr: 'ff_siwis', en: '', de: '', es: '' } }, 'de'); // 'ff_siwis'
 */
export function voiceFor(settings, language) {
  const own = settings.voices[language];
  if (own) {
    return own;
  }
  return LANGUAGES.map((lang) => settings.voices[lang]).find(Boolean) ?? null;
}

/**
 * Whether the model takes `instructions` (a speaking style): OpenAI's
 * `tts-1` and `tts-1-hd` do not.
 * @param {string} model - The model name.
 * @returns {boolean}
 */
export function takesInstructions(model) {
  return !/^tts-1(-hd)?$/i.test(model);
}
