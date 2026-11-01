/** Admit the PCM/float WAV and Ogg/Vorbis containers understood by the native player. */
export function inspectAudio(bytes: Buffer): 'audio/wav' | 'audio/ogg' {
  if (bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
    const end = bytes.readUInt32LE(4) + 8
    if (end > bytes.length || end < 44) throw new Error('Invalid WAV audio length.')
    let format: { align: number; rate: number } | undefined, data = 0
    for (let offset = 12; offset + 8 <= end;) {
      const size = bytes.readUInt32LE(offset + 4), start = offset + 8
      if (start + size > end) throw new Error('Truncated WAV audio chunk.')
      const name = bytes.toString('ascii', offset, offset + 4)
      if (name === 'fmt ') {
        if (size < 16) throw new Error('Invalid WAV audio format.')
        let codec = bytes.readUInt16LE(start)
        if (codec === 65534 && size >= 40) codec = bytes.readUInt16LE(start + 24)
        const channels = bytes.readUInt16LE(start + 2), rate = bytes.readUInt32LE(start + 4), align = bytes.readUInt16LE(start + 12), bits = bytes.readUInt16LE(start + 14)
        if ((codec !== 1 && codec !== 3) || channels < 1 || channels > 2 || rate < 8000 || rate > 192000
          || !(codec === 3 ? [32, 64] : [8, 16, 24, 32]).includes(bits) || align !== channels * bits / 8 || bytes.readUInt32LE(start + 8) !== rate * align) throw new Error('Unsupported WAV audio. Use PCM WAV or Ogg/Vorbis.')
        format = { align, rate }
      }
      if (name === 'data') data += size
      offset = start + size + size % 2
    }
    if (format === undefined || data === 0 || data % format.align !== 0) throw new Error('WAV audio has no complete sample data.')
    return 'audio/wav'
  }
  if (bytes.length >= 58 && bytes.toString('ascii', 0, 4) === 'OggS') {
    let serial: number | undefined, sequence = 0, ended = false
    for (let offset = 0; offset < bytes.length;) {
      if (offset + 27 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'OggS' || bytes[offset + 4] !== 0) throw new Error('Invalid Ogg/Vorbis audio page.')
      const segments = bytes[offset + 26]!, start = offset + 27 + segments
      if (start > bytes.length) throw new Error('Truncated Ogg/Vorbis audio page.')
      let size = 0
      for (let index = offset + 27; index < start; index++) size += bytes[index]!
      const end = start + size
      if (end > bytes.length) throw new Error('Truncated Ogg/Vorbis audio data.')
      const pageSerial = bytes.readUInt32LE(offset + 14)
      if (offset === 0) {
        serial = pageSerial
        if (size < 30 || bytes[start] !== 1 || bytes.toString('ascii', start + 1, start + 7) !== 'vorbis' || bytes.readUInt32LE(start + 7) !== 0 || !(bytes[start + 29]! & 1)) throw new Error('Unsupported Ogg audio codec. Use Vorbis, not Opus or video.')
        const channels = bytes[start + 11]!, rate = bytes.readUInt32LE(start + 12)
        if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000) throw new Error('Unsupported Vorbis audio format.')
      }
      if (pageSerial !== serial || bytes.readUInt32LE(offset + 18) !== sequence++) throw new Error('Unsupported chained or incomplete Ogg/Vorbis audio.')
      ended = Boolean(bytes[offset + 5]! & 4)
      if (ended && end !== bytes.length) throw new Error('Unexpected data after Ogg/Vorbis audio.')
      offset = end
    }
    if (!ended || sequence < 2) throw new Error('Incomplete Ogg/Vorbis audio stream.')
    return 'audio/ogg'
  }
  throw new Error('Unsupported audio. Import PCM WAV or Ogg/Vorbis; MP3 and Opus are not supported by this player.')
}
