import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { OpenAiSpeechClient } from '../src/openai/client.js';
import { CACHE_SIZE, MAX_CLIP_BYTES, MESSAGES, OpenAiTts } from '../src/integration.js';
import { CLIPS, fakeServer, json, recordingLogger } from './helpers/fakeServer.js';

const BASE = 'http://192.0.2.10:8880/v1';

async function setup({ config = { base_url: BASE }, routes, now } = {}) {
  const gladys = createFakeGladys({ config });
  const fetch = fakeServer(routes);
  const { logger, lines } = recordingLogger();
  const tts = new OpenAiTts(gladys, {
    client: new OpenAiSpeechClient({ fetch }),
    logger,
    now,
    timers: false,
  });
  registerHandlers(gladys, tts, { logger });
  await gladys.connect();
  return { gladys, fetch, tts, lines };
}

const decoded = (ack) => {
  const [type, payload] = ack.data.audio.split(';base64,');
  return { type, audio: Buffer.from(payload, 'base64') };
};
const triggers = (gladys) => gladys.fake.sceneEvents.map((event) => event.key ?? event.type);

test('at startup, the model and voice lists check the server, without any synthesis', async () => {
  const { gladys, fetch, lines } = await setup();
  assert.deepEqual(
    fetch.calls.map((call) => call.path),
    ['/v1/models', '/v1/audio/voices'],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.deepEqual(Object.keys(status.message), ['en', 'fr', 'de', 'es']);
  assert.equal(status.message.fr, 'Le serveur de synthèse vocale répond. Modèle : kokoro.');
  assert.ok(lines.info.includes('The speech server answers'));
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the status names the model and voices the server does not have', async () => {
  const { gladys } = await setup({
    config: { base_url: BASE, model: 'tts-2', voice_de: 'de_nobody' },
  });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Not on the server: "tts-2", "de_nobody"\./,
  );
});

test('without an address, the status asks for one and nothing is requested', async () => {
  const { gladys, fetch } = await setup({ config: {} });
  assert.equal(fetch.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.not_configured,
  });
  const ack = await gladys.fake.ttsSynthesize('Bonjour.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /Enter the address/);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a text is spoken with the voice of the language of the user', async () => {
  const { gladys, fetch } = await setup();
  const fr = await gladys.fake.ttsSynthesize('La porte est ouverte.', 'fr-FR');
  assert.equal(fr.success, true);
  const { type, audio } = decoded(fr);
  assert.equal(type, 'audio/mpeg');
  assert.deepEqual(audio, CLIPS.mp3);
  assert.equal(fetch.speech().at(-1).body.voice, 'ff_siwis');
  await gladys.fake.ttsSynthesize('The door is open.', 'en');
  assert.equal(fetch.speech().at(-1).body.voice, 'af_heart');
  await gladys.fake.ttsSynthesize('La puerta está abierta.', 'es');
  assert.equal(fetch.speech().at(-1).body.voice, 'ef_dora');
  // No German voice in Kokoro: French speaks, as for an unknown language.
  await gladys.fake.ttsSynthesize('Die Tür ist offen.', 'de');
  assert.equal(fetch.speech().at(-1).body.voice, 'ff_siwis');
  await gladys.fake.ttsSynthesize('Annonce.', null);
  assert.equal(fetch.speech().at(-1).body.voice, 'ff_siwis');
});

test('OpenAI settings: key, model, style, speed and format reach the request', async () => {
  const { gladys, fetch } = await setup({
    config: {
      base_url: 'https://api.openai.com/v1',
      api_key: 'sk-test-0000',
      model: 'gpt-4o-mini-tts',
      voice_fr: 'coral',
      speed: '1.1',
      response_format: 'opus',
      instructions: 'Speak calmly.',
    },
    routes: { '/v1/audio/voices': undefined },
  });
  const ack = await gladys.fake.ttsSynthesize('Le dîner est prêt.', 'fr');
  assert.equal(decoded(ack).type, 'audio/ogg');
  const call = fetch.speech().at(-1);
  assert.equal(call.url.origin, 'https://api.openai.com');
  assert.equal(call.headers.Authorization, 'Bearer sk-test-0000');
  assert.deepEqual(call.body, {
    model: 'gpt-4o-mini-tts',
    input: 'Le dîner est prêt.',
    voice: 'coral',
    response_format: 'opus',
    speed: 1.1,
    instructions: 'Speak calmly.',
  });
});

test('tts-1 and Kokoro never receive the speaking style', async () => {
  for (const model of ['tts-1', 'kokoro']) {
    const { gladys, fetch } = await setup({
      config: { base_url: BASE, model, instructions: 'Whisper.' },
    });
    await gladys.fake.ttsSynthesize('Bonsoir.', 'fr');
    assert.equal(fetch.speech().at(-1).body.instructions, undefined, model);
  }
});

test('used-up OpenAI credit fails the announcements without flapping the triggers', async () => {
  const { gladys, tts } = await setup({
    routes: {
      '/v1/audio/speech': () =>
        json('{"error":{"message":"You exceeded your current quota."}}', 429),
    },
  });
  for (let i = 0; i < 3; i += 1) {
    const ack = await gladys.fake.ttsSynthesize(`Alerte ${i}.`, 'fr');
    assert.equal(ack.success, false);
    assert.match(ack.error, /OpenAI credit is used up.*exceeded your current quota/);
    await tts.check();
  }
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('an address that cannot be used is said so, not taken for an empty one', async () => {
  const { gladys, fetch } = await setup({ config: { base_url: 'http://user:pass@192.0.2.10/v1' } });
  assert.equal(fetch.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.invalid_url,
  });
  const ack = await gladys.fake.ttsSynthesize('Bonjour.', 'fr');
  assert.match(ack.error, /not valid/);
});

test('the same announcement on several speakers is asked once, then served from memory', async () => {
  const { gladys, fetch, tts } = await setup();
  const acks = await Promise.all([
    gladys.fake.ttsSynthesize('Le linge est sec.', 'fr'),
    gladys.fake.ttsSynthesize('Le linge est sec.', 'fr'),
  ]);
  assert.ok(acks.every((ack) => ack.success));
  assert.equal(fetch.speech().length, 1);
  await gladys.fake.ttsSynthesize(' Le linge est sec. ', 'fr');
  assert.equal(fetch.speech().length, 1);
  // Another voice is another clip.
  await gladys.fake.ttsSynthesize('Le linge est sec.', 'en');
  assert.equal(fetch.speech().length, 2);

  for (let i = 0; i <= CACHE_SIZE; i += 1) {
    await gladys.fake.ttsSynthesize(`Texte ${i}.`, 'fr');
  }
  assert.equal(tts.cache.size, CACHE_SIZE);
  // New settings forget every clip.
  await gladys.fake.configUpdated({ base_url: BASE, speed: '1.25' });
  assert.equal(tts.cache.size, 0);
  await gladys.fake.ttsSynthesize('Le linge est sec.', 'fr');
  assert.equal(fetch.speech().at(-1).body.speed, 1.25);
});

test('a server that goes down fires server_offline once, and server_online on return', async () => {
  let down = false;
  const refused = () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  const guard = (answer) => (call) => (down ? refused() : answer(call));
  const { gladys, tts, lines } = await setup({
    routes: {
      '/v1/models': guard(() => json('{"data":[{"id":"kokoro"}]}')),
      '/v1/audio/voices': guard(() => json('{"voices":["ff_siwis","af_heart","ef_dora"]}')),
      '/v1/audio/speech': guard(() => new Response(CLIPS.mp3)),
    },
  });
  down = true;
  const ack = await gladys.fake.ttsSynthesize('Alerte.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /cannot be reached.*ECONNREFUSED/);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.unreachable,
  });
  await tts.check();
  await gladys.fake.ttsSynthesize('Alerte 2.', 'fr');
  assert.deepEqual(triggers(gladys), ['server_offline']);
  assert.equal(
    lines.warn.filter((l) => l.startsWith('The speech server is unavailable')).length,
    1,
  );

  down = false;
  await tts.check();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(triggers(gladys), ['server_offline', 'server_online']);
  assert.ok(lines.info.includes('The speech server answers again'));
});

test('a refused key is shown in Supervision and fires server_offline', async () => {
  const { gladys } = await setup({
    config: { base_url: 'https://api.openai.com/v1', api_key: 'sk-wrong' },
    routes: { '/v1/models': () => json('{"error":{"message":"Incorrect API key"}}', 401) },
  });
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: MESSAGES.auth });
  assert.deepEqual(triggers(gladys), ['server_offline']);
});

test('an unknown voice fails that request only: the status stays green', async () => {
  const { gladys } = await setup({
    config: { base_url: BASE, voice_en: 'zz_nobody' },
    routes: {
      '/v1/audio/speech': (call) =>
        call.body.voice === 'zz_nobody'
          ? json('{"detail":{"message":"Voice \'zz_nobody\' not found."}}', 400)
          : new Response(CLIPS.mp3),
    },
  });
  const ack = await gladys.fake.ttsSynthesize('Hello.', 'en');
  assert.equal(ack.success, false);
  assert.match(ack.error, /check the model, the voice.*Voice 'zz_nobody' not found/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal((await gladys.fake.ttsSynthesize('Bonjour.', 'fr')).success, true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a synthesis that runs out of time does not call the server offline', async () => {
  const { gladys } = await setup({
    routes: {
      '/v1/audio/speech': () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    },
  });
  const ack = await gladys.fake.ttsSynthesize('Un très long texte.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /keep announcements short/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a clip over 5 MB is refused with the advice of a lighter format', async () => {
  const { gladys } = await setup({
    config: { base_url: BASE, response_format: 'wav' },
    routes: {
      '/v1/audio/speech': () =>
        new Response(Buffer.concat([CLIPS.wav, Buffer.alloc(MAX_CLIP_BYTES)])),
    },
  });
  const ack = await gladys.fake.ttsSynthesize('Long.', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /choose the MP3 or Opus format/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a text with nothing to say fails without a request', async () => {
  const { gladys, fetch } = await setup();
  const ack = await gladys.fake.ttsSynthesize(' *** ', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /nothing to say/);
  assert.equal(fetch.speech().length, 0);
});

test('a normal synthesis writes nothing at info level, and never the text or the key', async () => {
  const { gladys, tts, lines } = await setup({
    config: { base_url: BASE, api_key: 'sk-secret-42' },
  });
  const before = lines.info.length;
  await gladys.fake.ttsSynthesize('Code du portail 1234.', 'fr');
  await gladys.fake.ttsSynthesize('Code du portail 1234.', 'fr');
  await tts.check();
  assert.equal(lines.info.length, before);
  assert.equal(lines.warn.length, 0);
  const all = Object.values(lines).flat().join('\n');
  assert.doesNotMatch(all, /sk-secret-42|portail/);
  assert.match(all, /API key set/);
});

test('"Test the voice" really asks the server, in the language chosen', async () => {
  let clock = 0;
  const { gladys, fetch } = await setup({
    now: () => clock,
    routes: {
      '/v1/audio/speech': () => {
        clock += 1500;
        return new Response(CLIPS.mp3);
      },
    },
  });
  const ack = await gladys.fake.action('test_voice', { language: 'es' });
  assert.equal(ack.success, true);
  assert.match(
    ack.data.message.fr,
    /en espagnol avec la voix « ef_dora » \(kokoro\) : 13 Ko en 1,5 s/,
  );
  assert.match(
    ack.data.message.en,
    /in Spanish with the voice "ef_dora" \(kokoro\): 13 KB in 1\.5 s/,
  );
  assert.equal(
    fetch.speech().at(-1).body.input,
    'Hola, soy Gladys. La puerta del garaje está abierta.',
  );
  // Without a language: French. A second press asks again.
  await gladys.fake.action('test_voice', {});
  await gladys.fake.action('test_voice');
  assert.equal(fetch.speech().length, 3);
  assert.equal(fetch.speech().at(-1).body.voice, 'ff_siwis');
});

test('"Show the voices" lists the voices of a language, or says the server has none', async () => {
  const { gladys } = await setup();
  const fr = await gladys.fake.action('list_voices', { language: 'fr' });
  assert.equal(fr.data.message.fr, '1 voix en français : ff_siwis.');
  const en = await gladys.fake.action('list_voices', { language: 'en' });
  assert.match(en.data.message.en, /^\d+ voices in English: af_alloy, .* and \d+ more\.$/);
  const de = await gladys.fake.action('list_voices', { language: 'de' });
  assert.match(
    de.data.message.de,
    /^Der Server hat keine Stimme auf Deutsch \(72 Stimmen insgesamt\)/,
  );
  const all = await gladys.fake.action('list_voices', {});
  assert.match(all.data.message.en, /^72 voices: af_alloy, /);

  const openai = await setup({ routes: { '/v1/audio/voices': undefined } });
  const none = await openai.gladys.fake.action('list_voices', { language: 'fr' });
  assert.match(none.data.message.en, /no voice list\. OpenAI voices: alloy, ash/);
});

test('a request arriving before the configuration is read waits for it', async () => {
  const gladys = createFakeGladys({ config: { base_url: BASE, voice_fr: 'ff_custom' } });
  const fetch = fakeServer();
  const { logger } = recordingLogger();
  const tts = new OpenAiTts(gladys, {
    client: new OpenAiSpeechClient({ fetch }),
    logger,
    timers: false,
  });
  const clip = await tts.handleSynthesize('Salut.', 'fr');
  assert.match(clip, /^audio\/mpeg;base64,/);
  assert.equal(fetch.speech().at(-1).body.voice, 'ff_custom');
});
