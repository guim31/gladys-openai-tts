// -----------------------------------------------------------------------------
// OpenAiTts: everything the SDK handlers of src/app.js call.
//
// - applyConfig(): takes the settings, then checks the server (model and voice
//   lists, never a synthesis: at OpenAI a synthesis costs money), shown as the
//   status in Supervision. Repeated every 5 minutes, so the scene triggers
//   `server_offline` / `server_online` follow the server. Never throws.
// - handleSynthesize(): turns a text Gladys wants spoken into a clip. Throwing
//   acks the command as failed: the scene action fails visibly.
// - testVoice(), listVoices(): the buttons of the configuration screen.
//
// A clip already made (same text and settings) is served from memory, and
// identical requests running at the same time (one announcement on several
// speakers) share one synthesis.
// -----------------------------------------------------------------------------

import { logger as defaultLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, requestLanguage, takesInstructions, voiceFor } from './config.js';
import { OpenAiSpeechClient } from './openai/client.js';

// Clips kept in memory (an MP3 of 2,000 characters makes about 2 MB).
export const CACHE_SIZE = 16;
// What Gladys accepts (5 MB decoded).
export const MAX_CLIP_BYTES = 5 * 1000 * 1000;
// Period of the check of the server, for the status and the scene triggers.
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Failures about the server itself: shown as the status, and fire the
// `server_offline` trigger. The others concern one request only (a voice the
// server does not have, a text with nothing to say).
const SERVICE_ERRORS = ['unreachable', 'timeout', 'auth', 'not_found', 'rate_limited', 'server'];

export const MESSAGES = {
  not_configured: {
    en: 'Enter the address of the speech server in the configuration, then save.',
    fr: "Saisissez l'adresse du serveur de synthèse vocale dans la configuration, puis enregistrez.",
    de: 'Gib die Adresse des Sprachservers in der Konfiguration ein und speichere.',
    es: 'Introduzca la dirección del servidor de síntesis de voz en la configuración y guarde.',
  },
  no_voice: {
    en: 'No voice is set: enter at least one voice in the configuration.',
    fr: 'Aucune voix réglée : saisissez au moins une voix dans la configuration.',
    de: 'Keine Stimme eingestellt: Gib in der Konfiguration mindestens eine Stimme ein.',
    es: 'No hay ninguna voz configurada: introduzca al menos una voz en la configuración.',
  },
  unreachable: {
    en: 'The speech server cannot be reached: check its address and that it is running.',
    fr: "Le serveur de synthèse vocale est injoignable : vérifiez son adresse et qu'il est démarré.",
    de: 'Der Sprachserver ist nicht erreichbar: Prüfe seine Adresse und ob er läuft.',
    es: 'No se puede acceder al servidor de síntesis de voz: compruebe su dirección y que esté en marcha.',
  },
  timeout: {
    en: 'The speech server does not answer in time: on a processor, keep announcements short.',
    fr: 'Le serveur de synthèse vocale ne répond pas à temps : sur processeur, gardez des annonces courtes.',
    de: 'Der Sprachserver antwortet nicht rechtzeitig: Halte Durchsagen auf einem Prozessor kurz.',
    es: 'El servidor de síntesis de voz no responde a tiempo: en un procesador, mantenga los anuncios cortos.',
  },
  auth: {
    en: 'The speech server refuses the API key: check it (OpenAI requires one).',
    fr: "Le serveur de synthèse vocale refuse la clé d'API : vérifiez-la (OpenAI en exige une).",
    de: 'Der Sprachserver lehnt den API-Schlüssel ab: Prüfe ihn (OpenAI verlangt einen).',
    es: 'El servidor de síntesis de voz rechaza la clave de API: compruébela (OpenAI exige una).',
  },
  not_found: {
    en: 'The speech server does not know this address or model: check that the address ends with /v1.',
    fr: "Le serveur de synthèse vocale ne connaît pas cette adresse ou ce modèle : vérifiez que l'adresse finit par /v1.",
    de: 'Der Sprachserver kennt diese Adresse oder dieses Modell nicht: Prüfe, ob die Adresse auf /v1 endet.',
    es: 'El servidor de síntesis de voz no conoce esta dirección o modelo: compruebe que la dirección termine en /v1.',
  },
  rejected: {
    en: 'The speech server refuses the request: check the model, the voice and the format.',
    fr: 'Le serveur de synthèse vocale refuse la requête : vérifiez le modèle, la voix et le format.',
    de: 'Der Sprachserver lehnt die Anfrage ab: Prüfe Modell, Stimme und Format.',
    es: 'El servidor de síntesis de voz rechaza la solicitud: compruebe el modelo, la voz y el formato.',
  },
  rate_limited: {
    en: 'The speech server limits the requests (or the OpenAI credit is used up). Try again later.',
    fr: 'Le serveur de synthèse vocale limite les requêtes (ou le crédit OpenAI est épuisé). Réessayez plus tard.',
    de: 'Der Sprachserver begrenzt die Anfragen (oder das OpenAI-Guthaben ist aufgebraucht). Versuch es später noch einmal.',
    es: 'El servidor de síntesis de voz limita las solicitudes (o el crédito de OpenAI se ha agotado). Vuelva a intentarlo más tarde.',
  },
  server: {
    en: 'The speech server is failing (server error). Check its logs.',
    fr: 'Le serveur de synthèse vocale est en panne (erreur serveur). Consultez ses journaux.',
    de: 'Der Sprachserver hat eine Störung (Serverfehler). Sieh dir seine Logs an.',
    es: 'El servidor de síntesis de voz falla (error del servidor). Consulte sus registros.',
  },
  invalid_response: {
    en: 'The speech server did not answer with audio Gladys can play (MP3, Opus, AAC or WAV).',
    fr: 'Le serveur de synthèse vocale n’a pas répondu par un son que Gladys sait lire (MP3, Opus, AAC ou WAV).',
    de: 'Der Sprachserver hat nicht mit Audio geantwortet, das Gladys abspielen kann (MP3, Opus, AAC oder WAV).',
    es: 'El servidor de síntesis de voz no respondió con un audio que Gladys pueda reproducir (MP3, Opus, AAC o WAV).',
  },
  too_long: {
    en: 'The clip is over the 5 MB Gladys accepts: choose the MP3 or Opus format for long texts.',
    fr: 'Le clip dépasse les 5 Mo que Gladys accepte : choisissez le format MP3 ou Opus pour les textes longs.',
    de: 'Der Clip ist größer als die 5 MB, die Gladys annimmt: Wähle für lange Texte das Format MP3 oder Opus.',
    es: 'El clip supera los 5 MB que acepta Gladys: elija el formato MP3 u Opus para los textos largos.',
  },
  empty: {
    en: 'There is nothing to say in the text.',
    fr: "Il n'y a rien à dire dans le texte.",
    de: 'Im Text gibt es nichts zu sagen.',
    es: 'No hay nada que decir en el texto.',
  },
};

// Sentence of the "Test the voice" button, per language.
export const SAMPLES = {
  fr: 'Bonjour, ici Gladys. La porte du garage est ouverte.',
  en: 'Hello, this is Gladys. The garage door is open.',
  de: 'Hallo, hier ist Gladys. Das Garagentor ist offen.',
  es: 'Hola, soy Gladys. La puerta del garaje está abierta.',
};

const LANGUAGE_NAMES = {
  en: { fr: 'French', en: 'English', de: 'German', es: 'Spanish' },
  fr: { fr: 'français', en: 'anglais', de: 'allemand', es: 'espagnol' },
  de: { fr: 'Französisch', en: 'Englisch', de: 'Deutsch', es: 'Spanisch' },
  es: { fr: 'francés', en: 'inglés', de: 'alemán', es: 'español' },
};

// Kokoro voice names: language letter, gender letter, underscore (ff_siwis).
const KOKORO_VOICE = /^([a-z])[fm]_/;
const KOKORO_LETTERS = { fr: ['f'], en: ['a', 'b'], es: ['e'], de: [] };
// The voices of the OpenAI API, for servers without a voice list.
export const OPENAI_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
];
// Longest list shown under the button.
const MAX_LISTED = 30;

const localized = (build) => Object.fromEntries(['en', 'fr', 'de', 'es'].map((l) => [l, build(l)]));

/**
 * Status shown in Supervision once the server answered.
 * @param {{model: string}} settings - Normalized settings.
 * @param {string[]} unknown - Model and voices the server lists without these.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function readyMessage(settings, unknown = []) {
  const list = unknown.map((name) => `"${name}"`).join(', ');
  const warning = unknown.length
    ? {
        en: ` Not on the server: ${list}.`,
        fr: ` Absents du serveur : ${list}.`,
        de: ` Nicht auf dem Server: ${list}.`,
        es: ` No están en el servidor: ${list}.`,
      }
    : { en: '', fr: '', de: '', es: '' };
  return {
    en: `The speech server answers. Model: ${settings.model}.${warning.en}`,
    fr: `Le serveur de synthèse vocale répond. Modèle : ${settings.model}.${warning.fr}`,
    de: `Der Sprachserver antwortet. Modell: ${settings.model}.${warning.de}`,
    es: `El servidor de síntesis de voz responde. Modelo: ${settings.model}.${warning.es}`,
  };
}

/**
 * Answer of the "Test the voice" button.
 * @param {{language: string, voice: string, model: string, bytes: number, ms: number}} test - What was spoken.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function testMessage({ language, voice, model, bytes, ms }) {
  const kb = Math.max(1, Math.round(bytes / 1024));
  const en = (ms / 1000).toFixed(1);
  const comma = en.replace('.', ',');
  const name = (lang) => LANGUAGE_NAMES[lang][language];
  return {
    en: `Test sentence spoken in ${name('en')} with the voice "${voice}" (${model}): ${kb} KB in ${en} s. Select this voice on the Artificial Intelligence page of Gladys.`,
    fr: `Phrase de test dite en ${name('fr')} avec la voix « ${voice} » (${model}) : ${kb} Ko en ${comma} s. Choisissez cette voix sur la page Intelligence Artificielle de Gladys.`,
    de: `Testsatz auf ${name('de')} mit der Stimme „${voice}“ (${model}) gesprochen: ${kb} KB in ${comma} s. Wähle diese Stimme auf der Seite Künstliche Intelligenz von Gladys.`,
    es: `Frase de prueba dicha en ${name('es')} con la voz «${voice}» (${model}): ${kb} KB en ${comma} s. Elija esta voz en la página Inteligencia artificial de Gladys.`,
  };
}

/**
 * Answer of the "Show the voices" button.
 * @param {string[]|null} voices - The voices of the server, null when it lists none.
 * @param {string|null} language - The language asked, null for all.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function voicesMessage(voices, language) {
  if (voices === null) {
    const list = OPENAI_VOICES.join(', ');
    return {
      en: `This server gives no voice list. OpenAI voices: ${list}. For another server, see its documentation.`,
      fr: `Ce serveur ne donne pas de liste de voix. Voix d'OpenAI : ${list}. Pour un autre serveur, voyez sa documentation.`,
      de: `Dieser Server liefert keine Stimmenliste. Stimmen von OpenAI: ${list}. Für einen anderen Server sieh in seiner Dokumentation nach.`,
      es: `Este servidor no da una lista de voces. Voces de OpenAI: ${list}. Para otro servidor, consulte su documentación.`,
    };
  }
  const kokoro = voices.some((voice) => KOKORO_VOICE.test(voice));
  const shown =
    language && kokoro
      ? voices.filter((voice) => KOKORO_LETTERS[language].includes(KOKORO_VOICE.exec(voice)?.[1]))
      : voices;
  const head = shown.slice(0, MAX_LISTED).join(', ');
  const more = shown.length - MAX_LISTED;
  return localized((lang) => {
    const where = language ? { en: ' in ', fr: ' en ', de: ' auf ', es: ' en ' }[lang] : '';
    const of = language ? `${where}${LANGUAGE_NAMES[lang][language]}` : '';
    if (shown.length === 0) {
      return {
        en: `The server has no voice${of} (${voices.length} voices in all). Leave the field empty: another language's voice will speak.`,
        fr: `Le serveur n'a pas de voix${of} (${voices.length} voix en tout). Laissez le champ vide : la voix d'une autre langue parlera.`,
        de: `Der Server hat keine Stimme${of} (${voices.length} Stimmen insgesamt). Lass das Feld leer: Die Stimme einer anderen Sprache spricht.`,
        es: `El servidor no tiene ninguna voz${of} (${voices.length} voces en total). Deje el campo vacío: hablará la voz de otro idioma.`,
      }[lang];
    }
    const tail =
      more > 0
        ? {
            en: ` and ${more} more`,
            fr: ` et ${more} autres`,
            de: ` und ${more} weitere`,
            es: ` y ${more} más`,
          }[lang]
        : '';
    return {
      en: `${shown.length} voices${of}: ${head}${tail}.`,
      fr: `${shown.length} voix${of} : ${head}${tail}.`,
      de: `${shown.length} Stimmen${of}: ${head}${tail}.`,
      es: `${shown.length} voces${of}: ${head}${tail}.`,
    }[lang];
  });
}

/**
 * The message of a failure, for the administrator.
 * @param {unknown} err - Usually a SpeechError.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function describeError(err) {
  return MESSAGES[err?.kind] ?? MESSAGES.unreachable;
}

/**
 * The error a failed command acks: the actionable text and the technical
 * detail, since only the message reaches Gladys.
 * @param {Error} err - The failure.
 * @returns {Error} The error to throw.
 */
function failure(err) {
  return new Error(`${describeError(err).en} [${err.message}]`, { cause: err });
}

class LocalError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export class OpenAiTts {
  /**
   * @param {object} gladys - The SDK instance (GladysIntegration).
   * @param {object} [deps]
   * @param {OpenAiSpeechClient} [deps.client] - Injectable for tests.
   * @param {{info: Function, warn: Function, debug: Function}} [deps.logger] - Injectable for tests.
   * @param {() => number} [deps.now] - Clock, injectable for tests.
   * @param {boolean} [deps.timers] - Whether to check the server periodically.
   */
  constructor(
    gladys,
    {
      client = new OpenAiSpeechClient(),
      logger = defaultLogger,
      now = Date.now,
      timers = true,
    } = {},
  ) {
    this.gladys = gladys;
    this.client = client;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.timer = null;
    this.settings = normalizeConfig({});
    this.loaded = false;
    this.loading = null;
    // Bumped by every configuration: a clip made with older settings is not kept.
    this.generation = 0;
    this.cache = new Map();
    this.inFlight = new Map();
    this.status = null;
    // Whether the server answered at the last contact: true, false, or
    // undefined before the first one (or without an address).
    this.online = undefined;
  }

  /**
   * Take the settings into account, then check the server.
   * @param {Record<string, unknown>} rawConfig - Configuration from the SDK.
   * @returns {Promise<void>} Never rejects.
   */
  async applyConfig(rawConfig) {
    this.useConfig(rawConfig);
    this.startTimer();
    await this.check();
  }

  /**
   * Take the settings into account, synchronously.
   * @param {Record<string, unknown>} rawConfig - Configuration from the SDK.
   * @returns {void}
   */
  useConfig(rawConfig) {
    this.settings = normalizeConfig(rawConfig);
    this.loaded = true;
    this.generation += 1;
    this.cache.clear();
    this.inFlight.clear();
    const { baseUrl, apiKey, model, format, speed } = this.settings;
    // The address alone: never the key, only whether there is one.
    this.logger.info(
      `Settings: server ${baseUrl ?? '(none)'}, model ${model}, format ${format}, speed ${speed}, API key ${apiKey ? 'set' : 'none'}`,
    );
  }

  /** Check the server every CHECK_INTERVAL_MS, once. */
  startTimer() {
    if (!this.timers || this.timer) {
      return;
    }
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  /** Stop the periodic check (shutdown, tests). */
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Check the server with its model and voice lists (free, even at OpenAI),
   * shown as the status.
   * @returns {Promise<void>} Never rejects.
   */
  async check() {
    const { settings, generation } = this;
    if (!settings.baseUrl) {
      this.online = undefined;
      await this.reportStatus(false, MESSAGES.not_configured);
      return;
    }
    try {
      const models = await this.client.models(settings);
      const voices = await this.client.voices(settings);
      if (generation !== this.generation) {
        return;
      }
      const unknown = [];
      if (models && models.length > 0 && !models.includes(settings.model)) {
        unknown.push(settings.model);
      }
      if (voices) {
        const set = [...new Set(Object.values(settings.voices).filter(Boolean))];
        unknown.push(...set.filter((voice) => !voices.includes(voice)));
      }
      this.logger.debug(
        `Server checked: ${models?.length ?? 'no'} model(s), ${voices?.length ?? 'no'} voice(s) listed`,
      );
      await this.markOnline(readyMessage(settings, unknown));
    } catch (err) {
      if (generation === this.generation) {
        await this.markOffline(err);
      }
    }
  }

  /**
   * Read the configuration when a command arrives before the SDK
   * resynchronized it.
   * @returns {Promise<void>}
   */
  async load() {
    if (this.loaded) {
      return;
    }
    this.loading ??= this.gladys.getConfig().then(
      (config) => {
        this.useConfig(config);
        this.startTimer();
        // Not awaited: the request waiting has its own time budget.
        this.check();
      },
      (err) => {
        this.loading = null;
        throw err;
      },
    );
    await this.loading;
  }

  /**
   * Synthesize a text Gladys wants spoken.
   * @param {string} text - The text (≤ 2,000 characters, capped by Gladys).
   * @param {string|null} language - Language of the requesting user, null when unknown.
   * @returns {Promise<string>} The clip, as `<content type>;base64,…`.
   * @throws {Error} When no clip can be made.
   */
  async handleSynthesize(text, language) {
    try {
      await this.load();
      const { audio, type } = await this.speak(
        typeof text === 'string' ? text : '',
        requestLanguage(language),
      );
      return `${type};base64,${audio.toString('base64')}`;
    } catch (err) {
      // The failed ack only reaches the Gladys server log: say it here too.
      this.logger.warn(`Speech not synthesized: ${err.message}`);
      throw err;
    }
  }

  /**
   * The "Test the voice" button: speaks a sentence with the saved settings.
   * @param {{language?: string}} [fields] - The language to test (French by default).
   * @returns {Promise<{en: string, fr: string, de: string, es: string}>} The message.
   * @throws {Error} When no clip can be made.
   */
  async testVoice(fields = {}) {
    await this.load();
    const language = requestLanguage(fields?.language);
    const start = this.now();
    // Never from memory: the button must really reach the server.
    const clip = await this.speak(SAMPLES[language], language, { fresh: true });
    const test = {
      language,
      voice: clip.voice,
      model: this.settings.model,
      bytes: clip.audio.length,
      ms: this.now() - start,
    };
    this.logger.info(`Voice tested: ${test.voice} (${language}), ${test.bytes} bytes`);
    return testMessage(test);
  }

  /**
   * The "Show the voices" button: the voices of the server, for one language.
   * @param {{language?: string}} [fields] - The language, all when absent.
   * @returns {Promise<{en: string, fr: string, de: string, es: string}>} The message.
   * @throws {Error} When the server does not answer.
   */
  async listVoices(fields = {}) {
    await this.load();
    const language = fields?.language ? requestLanguage(fields.language) : null;
    this.logger.info(`Voices listed${language ? ` (${language})` : ''}`);
    try {
      return voicesMessage(await this.client.voices(this.settings), language);
    } catch (err) {
      if (SERVICE_ERRORS.includes(err?.kind)) {
        await this.markOffline(err);
      }
      throw failure(err);
    }
  }

  /**
   * The clip of a text: from memory, from a synthesis already running, or
   * from the server. Reports the server's state as the status.
   * @param {string} text - The text.
   * @param {string} language - A code of LANGUAGES.
   * @param {{fresh?: boolean}} [options] - `fresh`: ask the server even when the clip is known.
   * @returns {Promise<{audio: Buffer, type: string, voice: string}>} The clip.
   * @throws {Error} The actionable failure.
   */
  async speak(text, language, { fresh = false } = {}) {
    const { settings, generation } = this;
    const input = text.trim();
    if (!/[\p{L}\p{N}]/u.test(input)) {
      throw failure(new LocalError('empty', 'nothing to say in the text'));
    }
    if (!settings.baseUrl) {
      throw failure(new LocalError('not_configured', 'no server address configured'));
    }
    const voice = voiceFor(settings, language);
    if (!voice) {
      throw failure(new LocalError('no_voice', 'no voice configured'));
    }
    const request = {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      voice,
      format: settings.format,
      speed: settings.speed,
      instructions: takesInstructions(settings.model) ? settings.instructions : '',
    };
    const key = JSON.stringify([voice, input]);
    const cached = fresh ? null : this.cache.get(key);
    if (cached) {
      this.logger.debug(`Clip served from memory (${input.length} characters)`);
      return cached;
    }
    let pending = fresh ? null : this.inFlight.get(key);
    if (!pending) {
      pending = this.client.speak(request, input).then((clip) => ({ ...clip, voice }));
      this.inFlight.set(key, pending);
      pending
        .finally(() => {
          if (this.inFlight.get(key) === pending) {
            this.inFlight.delete(key);
          }
        })
        .catch(() => {});
    }

    let clip;
    try {
      clip = await pending;
    } catch (err) {
      // A synthesis that runs out of time says nothing of the server: a CPU
      // engine is just slow on a long text. The periodic check tells.
      if (
        generation === this.generation &&
        SERVICE_ERRORS.includes(err?.kind) &&
        err.kind !== 'timeout'
      ) {
        await this.markOffline(err);
      }
      throw failure(err);
    }
    if (generation === this.generation && this.online !== true) {
      // Back after an outage: the periodic check refines the message later.
      await this.markOnline(readyMessage(settings));
    }
    if (clip.audio.length > MAX_CLIP_BYTES) {
      throw failure(
        new LocalError(
          'too_long',
          `${clip.audio.length} bytes of ${clip.type}, Gladys takes ${MAX_CLIP_BYTES} at most`,
        ),
      );
    }
    if (generation === this.generation) {
      this.cache.set(key, clip);
      if (this.cache.size > CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value);
      }
    }
    this.logger.debug(
      `Clip synthesized with "${voice}": ${input.length} characters, ${clip.audio.length} bytes of ${clip.type}`,
    );
    return clip;
  }

  /**
   * The server answers: status, and the `server_online` trigger after an outage.
   * @param {{en: string, fr: string, de: string, es: string}} message - The status.
   * @returns {Promise<void>}
   */
  async markOnline(message) {
    const was = this.online;
    this.online = true;
    if (was === false) {
      this.logger.info('The speech server answers again');
      await this.fire('server_online');
    } else if (was === undefined) {
      this.logger.info('The speech server answers');
    }
    await this.reportStatus(true, message);
  }

  /**
   * The server fails: status, and the `server_offline` trigger once per outage.
   * @param {Error & {kind?: string}} err - The failure.
   * @returns {Promise<void>}
   */
  async markOffline(err) {
    const was = this.online;
    this.online = false;
    if (was !== false) {
      this.logger.warn(`The speech server is unavailable: ${err?.message}`);
      await this.fire('server_offline');
    }
    await this.reportStatus(false, describeError(err));
  }

  /**
   * Fire a scene trigger; a failure is logged, never thrown.
   * @param {string} key - The trigger key of the manifest.
   * @returns {Promise<void>}
   */
  async fire(key) {
    try {
      await this.gladys.publishSceneEvent(key);
    } catch (err) {
      this.logger.warn(`Could not fire the ${key} scene trigger: ${err.message}`);
    }
  }

  /**
   * Publish the status, only when it changes. A failure is logged, never thrown.
   * @param {boolean} connected - Whether the server answers.
   * @param {{en: string, fr: string, de: string, es: string}} message - Shown to the administrator.
   * @returns {Promise<void>}
   */
  async reportStatus(connected, message) {
    if (this.status?.connected === connected && this.status?.message.en === message.en) {
      return;
    }
    this.status = { connected, message };
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (statusErr) {
      this.logger.warn(`Unable to publish the status: ${statusErr.message}`);
    }
  }
}
