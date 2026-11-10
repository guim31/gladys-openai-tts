# OpenAI-compatible voice

Gives Gladys the voice of any server that speaks the **OpenAI speech API**
(`POST /v1/audio/speech`): **Kokoro** at home with
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), LocalAI, Speaches,
openedai-speech… or **OpenAI** itself with your API key. The scene
announcements are spoken by it on your speakers.

## What you get

- A **voice for Gladys** (Gladys 5.3.0 or later): once selected, the **Talk on a
  speaker** scene action speaks with your server on your speakers (Sonos,
  Google Cast, AirPlay…).
- **One voice per language** of Gladys (French, English, German, Spanish): each
  user hears the voice of their language. A language left empty borrows the
  voice of another one.
- Speed, audio format (MP3, Opus, AAC, WAV) and, with `gpt-4o-mini-tts`, a
  **speaking style** ("Speak calmly and warmly").
- **Test the voice** and **Show the voices** buttons in the configuration.
- Two scene triggers: **Voice server unavailable** and **Voice server back**,
  for example to be warned when announcements can no longer be spoken.

## Before you start

- **Kokoro (local, free)**: run the Kokoro-FastAPI Docker image on a machine
  of your network, for example
  `docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu` (or the
  `-gpu` image with an NVIDIA card). Texts stay at home. Kokoro has French,
  English, Spanish, Italian, Portuguese, Hindi, Japanese and Chinese voices,
  but **no German voice**.
- **OpenAI (cloud, paid)**: an API key from
  [platform.openai.com](https://platform.openai.com/api-keys) with credit.
  Every text spoken is sent to OpenAI and billed per character, under the
  OpenAI terms. **This integration was not tested against OpenAI** (no key was
  used): it follows the API documentation, feedback welcome.
- Other servers (LocalAI, Speaches…): use the address, model and voice names
  their documentation gives.
- Not affiliated with OpenAI, nor with the Kokoro, LocalAI or Speaches
  projects.

## Configuration

1. Install the integration, then open its **Configuration** tab.
2. **Server address**: the address of the API, ending with `/v1`, for example
   `http://<host>:8880/v1` for Kokoro-FastAPI, or
   `https://api.openai.com/v1`. A bare `host:port` is completed with
   `http://` and `/v1`.
3. **API key**: required by OpenAI, empty for a local server without key.
4. **Model**: `kokoro` for Kokoro-FastAPI; `tts-1`, `tts-1-hd` or
   `gpt-4o-mini-tts` at OpenAI.
5. **Voices**: one per language. Kokoro: `ff_siwis` (French), `af_heart` or
   `bf_emma` (English), `ef_dora` (Spanish). OpenAI: `alloy`, `coral`,
   `nova`, `sage`… (each speaks every language). Leave a language empty to
   use the voice of another one (French first).
6. **Speed**, **Audio format** (MP3 by default) and, for `gpt-4o-mini-tts`
   only, **Speaking style**.
7. Save, then press **Show the voices** to see what the server offers, and
   **Test the voice** to check that a clip comes back (size and time taken;
   the button does not play it).
8. Open **Integrations → Artificial Intelligence** and choose this
   integration in the **Voice** card.

## Using it in scenes

Add a **Talk on a speaker** action to a scene, pick a speaker and type the
text. Gladys asks this integration for the clip, then serves it to the speaker
on your local network.

The triggers **Voice server unavailable** (the server stopped answering,
refuses the key or the requests) and **Voice server back** start a scene, for
example to send you a message. The server is checked every 5 minutes and at
each announcement.

The voice assistant of Gladys stays text-only with a voice integration: its
page runs over HTTPS, and the clip is served over the local network in HTTP,
which the browser blocks. This is a limit of Gladys, the same for every voice
integration.

## Limits

- **Gladys waits 30 seconds** for the clip. Kokoro on a **processor** is slow:
  on a 4-core mini PC, about 4 s for a short sentence and 3 minutes for the
  2,000 characters Gladys sends at most. Keep announcements **under about 250
  characters** on a processor, or use a graphics card. A text that runs out of
  time fails without marking the server unavailable.
- Gladys refuses clips **over 5 MB**: about 100 seconds in WAV. MP3 and Opus
  fit any text.
- A clip already made (same text and voice) is kept in memory (the 16
  latest), and one announcement on several speakers asks the server once.
- Only the fields of the OpenAI API are sent: Kokoro-specific options (voice
  mixes, `lang_code`) are not offered.

## Troubleshooting

- **Supervision** shows whether the server answers, the model in use, and the
  model or voices the server does not list.
- A failed announcement is written in the **logs** of the integration, with
  the reason the server gave (unknown voice, refused key, used-up credit…).
  The text spoken and the key are never written.
- "Does not know this address": check that the address ends with `/v1`.
- More details in debug: set the log level of the integration to debug.
