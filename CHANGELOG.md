# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-10

### Added

- A voice for Gladys 5.3 from any server of the OpenAI speech API: Kokoro
  (Kokoro-FastAPI), LocalAI, Speaches, or OpenAI with your API key.
- One voice per language of Gladys, with a fallback on another language's
  voice; model, speed, audio format (MP3, Opus, AAC, WAV) and speaking style
  (`gpt-4o-mini-tts`).
- "Test the voice" and "Show the voices" buttons.
- Status in Supervision, checked every 5 minutes without any synthesis, and the
  scene triggers "Voice server unavailable" and "Voice server back".
- One announcement on several speakers asks the server once; the latest clips
  are kept in memory.

[Unreleased]: https://github.com/guim31/gladys-openai-tts/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-openai-tts/releases/tag/v1.0.0
