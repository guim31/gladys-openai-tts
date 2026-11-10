// -----------------------------------------------------------------------------
// Wiring of the integration on a Gladys client.
//
// Kept apart from `index.js` so the tests can run it against the SDK's fake
// Gladys (`createFakeGladys` from `@gladysassistant/integration-sdk/testing`).
// -----------------------------------------------------------------------------

import { logger as defaultLogger } from '@gladysassistant/integration-sdk';

/**
 * Register every handler on `gladys`, before connect().
 * @param {object} gladys - The SDK instance (GladysIntegration).
 * @param {import('./integration.js').OpenAiTts} tts - What the handlers call.
 * @param {object} [deps]
 * @param {{info: Function}} [deps.logger] - Injectable for tests.
 * @returns {void}
 * @example
 * registerHandlers(gladys, new OpenAiTts(gladys));
 */
export function registerHandlers(gladys, tts, { logger = defaultLogger } = {}) {
  // --- Speech ----------------------------------------------------------------
  // The integration is the voice an administrator selected on the Artificial
  // Intelligence page. `language` is the requesting user's (the first
  // administrator's for an announcement), null when unknown. Gladys waits 30 s.
  gladys.onTtsSynthesize((text, language) => tts.handleSynthesize(text, language));

  // --- Buttons of the configuration screen ------------------------------------
  gladys.onAction('test_voice', (fields) => tts.testVoice(fields));
  gladys.onAction('list_voices', (fields) => tts.listVoices(fields));

  // --- Configuration screen ----------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('New configuration received');
    await tts.applyConfig(newConfig);
  });

  // --- Connection lifecycle ----------------------------------------------------
  // The SDK emits `connected` once it has resynchronized the configuration, so
  // `gladys.config` is fresh here. applyConfig never rejects.
  gladys.on('connected', () => tts.applyConfig(gladys.config));

  // --- Graceful shutdown -------------------------------------------------------
  gladys.handleShutdown(async () => tts.stop?.());
}
