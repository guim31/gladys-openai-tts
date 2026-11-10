// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the messages of the code
// and the documentation. German says "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MESSAGES, readyMessage, testMessage, voicesMessage } from '../src/integration.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = { catalog: 100, label: 60, placeholder: 60, description: 300, message: 200 };

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text !== 'string' || text.trim() === '') {
      found.push(`${path}.${lang} is empty`);
      continue;
    }
    if (text.length > max) {
      found.push(`${path}.${lang} has ${text.length} characters (${max} at most)`);
    }
    if (lang === 'de' && POLITE_GERMAN.test(text)) {
      found.push(`${path}.${lang} uses the polite form: "${text}"`);
    }
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max = path === 'manifest.description' ? MAX.catalog : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 57, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('every message of the code has the four languages', () => {
  const kokoro = Array.from({ length: 72 }, (_, i) => `af_voice${i}`);
  const settings = { model: 'gpt-4o-mini-tts' };
  const found = [
    ...Object.entries(MESSAGES).flatMap(([key, value]) =>
      problems(value, `MESSAGES.${key}`, MAX.message),
    ),
    ...problems(readyMessage(settings), 'ready', MAX.message),
    ...problems(readyMessage(settings, ['tts-2', 'de_nobody']), 'ready', MAX.message),
    ...problems(
      testMessage({ language: 'de', voice: 'ff_siwis', model: 'kokoro', bytes: 9000, ms: 1234 }),
      'testMessage',
      MAX.message,
    ),
    ...problems(voicesMessage(null, null), 'voices', 300),
    ...problems(voicesMessage(kokoro, 'de'), 'voices', MAX.message),
    ...problems(voicesMessage(kokoro, 'en'), 'voices', 400),
  ];
  assert.deepEqual(found, []);
});

test('the four documentations have the same sections', async () => {
  const headings = {};
  for (const lang of LANGS) {
    const text = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    assert.ok(text.length >= 300, `docs/${lang}.md is too short`);
    headings[lang] = text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
    if (lang === 'de') {
      assert.doesNotMatch(text, POLITE_GERMAN, 'docs/de.md uses the polite form');
    }
  }
  for (const lang of LANGS) {
    assert.equal(headings[lang], headings.en, `docs/${lang}.md sections`);
  }
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'Wählen Sie', es: 'a' }, 'x', 60).length, 1);
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
