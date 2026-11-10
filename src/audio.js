// -----------------------------------------------------------------------------
// What a clip really is, read from its first bytes: the content type a server
// announces is not always the right one (some send `application/octet-stream`,
// or `audio/mpeg` for every format), and Gladys only plays four types.
// -----------------------------------------------------------------------------

/**
 * The content type Gladys accepts for this clip, from its first bytes.
 * @param {Buffer} audio - The clip.
 * @returns {'audio/mpeg'|'audio/wav'|'audio/ogg'|'audio/aac'|null} Its type, null when not one of these.
 * @example
 * sniffAudio(Buffer.from('OggS...')); // 'audio/ogg'
 */
export function sniffAudio(audio) {
  if (!Buffer.isBuffer(audio) || audio.length < 4) {
    return null;
  }
  const ascii = (start, end) => audio.toString('latin1', start, end);
  if (ascii(0, 3) === 'ID3') {
    return 'audio/mpeg';
  }
  if (ascii(0, 4) === 'RIFF' && audio.length >= 12 && ascii(8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  if (ascii(0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  if (audio[0] === 0xff && (audio[1] & 0xf0) === 0xf0) {
    // ADTS (AAC): the 2 layer bits are 00. MPEG audio: layer bits non-zero.
    return (audio[1] & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg';
  }
  if (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0) {
    // MPEG 2.5 frame sync (11 bits).
    return 'audio/mpeg';
  }
  return null;
}
