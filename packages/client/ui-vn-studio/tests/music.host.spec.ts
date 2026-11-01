import { expect, it } from 'vitest'
import { renderMusic, renderEffect } from '../src/music.ts'

it('renders a bounded score as audible PCM WAV with correct timing', () => {
  const wav = renderMusic({ tempo: 120, instrument: 'piano', notes: [
    { midi: 60, beat: 0, duration: 1, velocity: 0.7 }, { midi: 64, beat: 1, duration: 1, velocity: 0.6 },
  ] })
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
  expect(wav.readUInt32LE(24)).toBe(22050)
  expect(wav.readUInt32LE(40)).toBe(wav.length - 44)
  expect(wav.length).toBeGreaterThan(44100)
  expect(wav.length).toBeLessThan(66000)
  const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, index) => wav.readInt16LE(44 + index * 2))
  expect(Math.max(...samples)).toBeGreaterThan(1000)
  expect(Math.min(...samples)).toBeLessThan(-1000)
  expect(samples[0]).toBe(0)
  expect(Math.abs(samples.at(-1)!)).toBeLessThan(10)
})

it('refuses malformed, unbounded or empty model scores', () => {
  for (const score of [
    { tempo: 0, instrument: 'piano', notes: [] },
    { tempo: 80, instrument: 'shell-command', notes: [{ midi: 60, beat: 0, duration: 1, velocity: 1 }] },
    { tempo: 80, instrument: 'piano', notes: [{ midi: NaN, beat: 0, duration: 1, velocity: 1 }] },
    { tempo: 40, instrument: 'piano', notes: [{ midi: 60, beat: 100000, duration: 1, velocity: 1 }] },
  ]) expect(() => renderMusic(score)).toThrow(/score|tempo|instrument|note|duration/i)
})

it('renders three distinct short effects as real audio', () => {
  const sounds = ['bell', 'rain', 'steps'].map(preset => renderEffect(preset))
  expect(new Set(sounds.map(sound => sound.toString('base64'))).size).toBe(3)
  for (const sound of sounds) expect(sound.toString('ascii', 8, 12)).toBe('WAVE')
  expect(() => renderEffect('unknown')).toThrow(/effect|preset/i)
})
