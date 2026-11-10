import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  normalizeBaseUrl,
  normalizeConfig,
  requestLanguage,
  takesInstructions,
  voiceFor,
} from '../src/config.js';

test('the server address gets a scheme and /v1 when missing, and loses its trailing slash', () => {
  assert.equal(normalizeBaseUrl('192.0.2.10:8880'), 'http://192.0.2.10:8880/v1');
  assert.equal(normalizeBaseUrl(' http://192.0.2.10:8880/ '), 'http://192.0.2.10:8880/v1');
  assert.equal(normalizeBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(normalizeBaseUrl('http://192.0.2.10:8080/api/v1'), 'http://192.0.2.10:8080/api/v1');
});

test('an empty, invalid or credential-bearing address is no address', () => {
  assert.equal(normalizeBaseUrl(''), null);
  assert.equal(normalizeBaseUrl(undefined), null);
  assert.equal(normalizeBaseUrl('ftp://192.0.2.10/v1'), null);
  assert.equal(normalizeBaseUrl('http://user:pass@192.0.2.10/v1'), null);
  assert.equal(normalizeBaseUrl('http://[::1'), null);
});

test('defaults speak Kokoro, unknown values fall back to them', () => {
  const settings = normalizeConfig({ speed: '7', response_format: 'flac', model: '  ' });
  assert.equal(settings.model, DEFAULT_CONFIG.model);
  assert.equal(settings.speed, 1);
  assert.equal(settings.format, 'mp3');
  assert.deepEqual(settings.voices, { fr: 'ff_siwis', en: 'af_heart', de: '', es: 'ef_dora' });
  assert.equal(normalizeConfig(null).baseUrl, null);
  assert.equal(normalizeConfig({}).invalidUrl, false);
  assert.equal(normalizeConfig({ base_url: 'ftp://192.0.2.10/v1' }).invalidUrl, true);
  assert.equal(normalizeConfig({ speed: '1.25' }).speed, 1.25);
});

test('the language of a request is one of the four of Gladys, French otherwise', () => {
  assert.equal(requestLanguage('en'), 'en');
  assert.equal(requestLanguage('de-DE'), 'de');
  assert.equal(requestLanguage('ES_es'), 'es');
  assert.equal(requestLanguage('it'), 'fr');
  assert.equal(requestLanguage(null), 'fr');
});

test('a language without voice borrows the first one set, French first', () => {
  const settings = normalizeConfig({ voice_fr: '', voice_de: '' });
  assert.equal(voiceFor(settings, 'de'), 'af_heart');
  assert.equal(voiceFor(settings, 'es'), 'ef_dora');
  assert.equal(voiceFor(normalizeConfig({}), 'de'), 'ff_siwis');
  const none = normalizeConfig({ voice_fr: '', voice_en: '', voice_es: '' });
  assert.equal(voiceFor(none, 'fr'), null);
});

test('only the gpt-…-tts models take a speaking style', () => {
  assert.equal(takesInstructions('tts-1'), false);
  assert.equal(takesInstructions('TTS-1-HD'), false);
  assert.equal(takesInstructions('gpt-4o-mini-tts'), true);
  assert.equal(takesInstructions('kokoro'), false);
});
