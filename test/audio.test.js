import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffAudio } from '../src/audio.js';
import { CLIPS } from './helpers/fakeServer.js';

test('the real clips of Kokoro-FastAPI are recognized in the four formats Gladys plays', () => {
  assert.equal(sniffAudio(CLIPS.mp3), 'audio/mpeg');
  assert.equal(sniffAudio(CLIPS.opus), 'audio/ogg');
  assert.equal(sniffAudio(CLIPS.aac), 'audio/aac');
  assert.equal(sniffAudio(CLIPS.wav), 'audio/wav');
});

test('an MP3 without ID3 tag is recognized by its frame header', () => {
  assert.equal(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64])), 'audio/mpeg');
});

test('what Gladys cannot play is refused', () => {
  assert.equal(sniffAudio(Buffer.from('fLaC\0\0\0"')), null);
  assert.equal(sniffAudio(Buffer.from('{"detail":"oops"}')), null);
  assert.equal(sniffAudio(Buffer.alloc(0)), null);
  assert.equal(sniffAudio('ID3'), null);
});
