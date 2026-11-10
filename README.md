# Gladys OpenAI-compatible voice

A text-to-speech provider for [Gladys Assistant](https://gladysassistant.com)
(5.3.0 or later) that speaks the **OpenAI speech API**
(`POST /v1/audio/speech`): **Kokoro** at home with
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), LocalAI, Speaches,
openedai-speech… or **OpenAI** with your own API key. Once selected as the voice
of Gladys, the scene announcements are spoken by it on your speakers.

## Features

- One voice per language of Gladys (French, English, German, Spanish), each
  user hearing their own; an empty language borrows another's voice.
- Model, speed, audio format (MP3, Opus, AAC, WAV) and, for
  `gpt-4o-mini-tts`, a speaking style.
- **Test the voice** and **Show the voices** buttons (the voice list of
  Kokoro-FastAPI, or the OpenAI voices).
- Status in Supervision (server answering, model or voices it does not list),
  checked every 5 minutes without any synthesis, so it costs nothing at
  OpenAI.
- Scene triggers **Voice server unavailable** / **Voice server back**.
- One announcement on several speakers asks the server once; the 16 latest
  clips are kept in memory.
- Neither the texts nor the key are ever written to the logs.

## Requirements

- Gladys Assistant 5.3.0 or later.
- A speech server reachable from Gladys, for example
  `docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu`, or an OpenAI
  API key with credit (texts are then sent to OpenAI and billed).

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-openai-tts`. Then fill the server address
(ending with `/v1`), the model and the voices, save, and choose this
integration in **Integrations → Artificial Intelligence → Voice**. The full
guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## Limits

- Gladys waits 30 seconds for a clip. Kokoro on a CPU needs about 4 s for a
  short sentence and 3 minutes for 2,000 characters on a 4-core mini PC: keep
  announcements under about 250 characters, or use a GPU.
- Gladys refuses clips over 5 MB (about 100 seconds of WAV).
- Kokoro has no German voice: German texts are then spoken by another
  language's voice.
- **Tested for real against Kokoro-FastAPI only. Not tested against OpenAI**
  (no key was used): the OpenAI side follows the API documentation. Feedback
  welcome.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests never touch the network: `test/fixtures/` holds real answers of
Kokoro-FastAPI (clips in the four formats, voice and model lists, errors) and
OpenAI answers written after its documentation. See [`CLAUDE.md`](CLAUDE.md)
for the project rules.

## Credits

- [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) by remsky
  (Apache-2.0) and the [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)
  model by hexgrad (Apache-2.0), used for the real tests and the fixtures.
- The [OpenAI speech API reference](https://platform.openai.com/docs/api-reference/audio/createSpeech),
  for the OpenAI side and its fixtures.
- Cover: original pictogram (no third-party logo).
- Built on the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js)
  and [SDK](https://github.com/GladysAssistant/integration-sdk-js) of Gladys.

Not affiliated with OpenAI, nor with the Kokoro, LocalAI or Speaches projects.
OpenAI is a trademark of OpenAI.

## License

[Apache-2.0](LICENSE).
