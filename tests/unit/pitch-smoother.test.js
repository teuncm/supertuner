import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPitchSmoother } from '../../src/scripts/pitch-smoother.js'
import { describePitch } from '../../src/scripts/detection.js'

const reading = (cents) => describePitch(440 * 2 ** (cents / 1200), 1)

test('uses conventional tuner sharp/flat spellings and correct octaves', () => {
  const expected = ['C4', 'C♯4', 'D4', 'E♭4', 'E4', 'F4', 'F♯4', 'G4', 'G♯4', 'A4', 'B♭4', 'B4']
  for (let i = 0; i < expected.length; i++) {
    assert.equal(describePitch(440 * 2 ** ((60 + i - 69) / 12), 1).noteName, expected[i])
  }
})

test('keeps the note identity steady near a semitone midpoint', () => {
  const smoother = createPitchSmoother()
  for (let i = 0; i < 60; i++) {
    assert.equal(smoother.update(reading(i % 2 ? 51 : 49), i * 6).noteName, 'A4')
  }
  let result
  for (let i = 60; i < 100; i++) result = smoother.update(reading(65), i * 6)
  assert.equal(result.noteName, 'B♭4')
  assert.ok(Math.abs(result.cents + 35) < 1)
})

test('damps jitter and rejects a single octave spike', () => {
  const smoother = createPitchSmoother()
  let maximum = 0
  for (let i = 0; i < 100; i++) {
    const result = smoother.update(reading(i === 50 ? 1200 : i % 2 ? 3 : -3), i * 6)
    if (i > 20) maximum = Math.max(maximum, Math.abs(result.cents))
    assert.equal(result.midiNumber, 69)
  }
  assert.ok(maximum < 1.5, `Jitter was not reduced by half: ${maximum} cents`)
})

test('tracks real tuning adjustments and promptly accepts confirmed note changes', () => {
  const smoother = createPitchSmoother()
  for (let i = 0; i < 10; i++) smoother.update(reading(0), i * 6)
  let result
  for (let i = 10; i < 50; i++) result = smoother.update(reading(12), i * 6)
  assert.ok(Math.abs(result.cents - 12) < 0.5)
  assert.equal(smoother.update(reading(1200), 300).midiNumber, 69)
  assert.equal(smoother.update(reading(1200), 306).midiNumber, 81)
})

test('clears immediately on silence and recalculates pitch against the reference', () => {
  const smoother = createPitchSmoother()
  smoother.update(reading(0), 0)
  assert.equal(smoother.update(null, 6), null)
  const result = smoother.update(reading(0), 12, 442)
  assert.ok(Math.abs(result.cents - 1200 * Math.log2(440 / 442)) < 0.001)
  assert.equal(smoother.update(reading(1200), 18).midiNumber, 69)
})

test('retains smoothing through brief detection gaps instead of snapping to a weak outlier', () => {
  const smoother = createPitchSmoother()
  for (let i = 0; i < 100; i++) smoother.update(reading(0), i * 6)
  assert.equal(smoother.update(null, 600), null)
  const resumed = smoother.update(reading(25), 606)
  assert.ok(Math.abs(resumed.cents) < 1)
  // A fresh attack after a longer silence can still acquire a new note quickly.
  assert.equal(smoother.update(reading(1200), 800).midiNumber, 81)
})
