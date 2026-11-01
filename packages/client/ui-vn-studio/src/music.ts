/** Bounded score synthesis for original, simple background music and effects. */
const SAMPLE_RATE = 22050

interface Note { midi: number; beat: number; duration: number; velocity: number }
interface Score { tempo: number; instrument: 'piano' | 'pad' | 'bell'; notes: Note[] }

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a musical score object.')
  return value as Record<string, unknown>
}
function number(value: unknown, low: number, high: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new Error(`Invalid score ${name}.`)
  return value
}
/** Validate the bounded score accepted by production plans and the audio renderer.
 * @param value - Untrusted structured musical score.
 * @returns Admitted score with supported instrument, notes and duration.
 */
export function parseScore(value: unknown): Score {
  const row = record(value)
  const tempo = number(row.tempo, 40, 180, 'tempo')
  const instrument = row.instrument
  if (instrument !== 'piano' && instrument !== 'pad' && instrument !== 'bell') throw new Error('Invalid score instrument.')
  if (!Array.isArray(row.notes) || row.notes.length < 1 || row.notes.length > 512) throw new Error('Expected 1–512 score notes.')
  const notes = row.notes.map((value: unknown): Note => {
    const note = record(value)
    const midi = number(note.midi, 36, 96, 'note pitch')
    if (!Number.isInteger(midi)) throw new Error('Score note pitch must be a MIDI integer.')
    return { midi, beat: number(note.beat, 0, 128, 'note beat'), duration: number(note.duration, 0.0625, 8, 'note duration'), velocity: number(note.velocity, 0.01, 1, 'note velocity') }
  })
  if (Math.max(...notes.map(note => note.beat + note.duration)) * 60 / tempo > 60) throw new Error('Score duration exceeds 60 seconds.')
  return { tempo, instrument, notes }
}

function wav(samples: Float64Array): Buffer {
  let peak = 1
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
  const bytes = Buffer.alloc(44 + samples.length * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SAMPLE_RATE, 24); bytes.writeUInt32LE(SAMPLE_RATE * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  for (let index = 0; index < samples.length; index++) bytes.writeInt16LE(Math.round(samples[index]! / peak * 26000), 44 + index * 2)
  return bytes
}

/** Render a validated model/user score as mono 16-bit PCM; no external service is implied. */
export function renderMusic(value: unknown): Buffer {
  const score = parseScore(value)
  const secondsPerBeat = 60 / score.tempo
  const duration = Math.max(...score.notes.map(note => note.beat + note.duration)) * secondsPerBeat + 0.2
  const samples = new Float64Array(Math.ceil(duration * SAMPLE_RATE))
  for (const note of score.notes) {
    const start = Math.round(note.beat * secondsPerBeat * SAMPLE_RATE)
    const length = Math.round(note.duration * secondsPerBeat * SAMPLE_RATE)
    const frequency = 440 * 2 ** ((note.midi - 69) / 12)
    for (let offset = 0; offset < length; offset++) {
      const time = offset / SAMPLE_RATE
      const phase = 2 * Math.PI * frequency * time
      const attack = Math.min(1, time / (score.instrument === 'pad' ? 0.08 : 0.012))
      const release = Math.min(1, (length - offset) / (SAMPLE_RATE * 0.12))
      const envelope = attack * release * (score.instrument === 'pad' ? 0.65 : Math.exp(-time * (score.instrument === 'bell' ? 4 : 2.4)))
      const wave = Math.sin(phase) + 0.24 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * (score.instrument === 'bell' ? 3.01 : 3))
      samples[start + offset] = samples[start + offset]! + wave * envelope * note.velocity * 0.3
    }
  }
  return wav(samples)
}

/** Render one named, explicitly synthesized effect as PCM WAV. */
export function renderEffect(preset: string): Buffer {
  if (preset === 'bell') return renderMusic({ tempo: 120, instrument: 'bell', notes: [{ midi: 84, beat: 0, duration: 2, velocity: 0.8 }] })
  if (preset !== 'rain' && preset !== 'steps') throw new Error('Unknown sound effect preset.')
  const duration = preset === 'rain' ? 3 : 1.5
  const samples = new Float64Array(SAMPLE_RATE * duration)
  let seed = 47923, filtered = 0
  for (let index = 0; index < samples.length; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 0xffffffff * 2 - 1
    filtered = filtered * 0.75 + noise * 0.25
    const time = index / SAMPLE_RATE
    const fade = Math.min(1, time / 0.05, (duration - time) / 0.12)
    const pulse = preset === 'rain' ? 0.18 : Math.exp(-(time % 0.45) * 32) * 0.65
    samples[index] = filtered * pulse * fade
  }
  return wav(samples)
}
