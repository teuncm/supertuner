import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPitchTracker } from '../../src/scripts/pitch-tracker.js'
import { analyzePitch, createMPMDetector } from '../../src/scripts/detection.js'
import { getPitchWindowSize } from '../../src/scripts/constants.js'

function makeSignal(frequency, sampleRate, length, harmonics = [1], offset = 0) {
  return Float32Array.from({ length }, (_, i) => {
    const t = (i + offset) / sampleRate
    if (t < 0) return 0
    return harmonics.reduce((sum, amplitude, h) => sum + 0.15 * amplitude * Math.sin(2 * Math.PI * frequency * (h + 1) * t), 0)
  })
}

for (const sampleRate of [44100, 48000, 96000]) {
  test(`accurate pitch and octave across pure and harmonic-rich notes at ${sampleRate} Hz`, () => {
    for (const harmonics of [[1], [.2, 1, .7, .35], [0, 1, .7, .35]]) {
      for (const frequency of [30.8677, 41.2034, 55, 82.4069, 110, 220, 440, 880, 1760]) {
        const tracker = createPitchTracker()
        const size = getPitchWindowSize(sampleRate)
        let result
        for (let frame = 256; frame <= size * 3; frame += 256) {
          result = tracker.analyze(makeSignal(frequency, sampleRate, size, harmonics, frame - size), sampleRate, Math.min(size, frame), 440, 256)
        }
        assert.ok(result.valid, `${frequency} Hz: no reading`)
        assert.ok(Math.abs(1200 * Math.log2(result.frequency / frequency)) < 1, `${frequency} Hz with harmonics ${harmonics}: got ${result.frequency}`)
      }
    }
  })
}

test('clears silence promptly and reacquires across octaves', () => {
  const tracker = createPitchTracker()
  const sampleRate = 48000
  for (const frequency of [82.4069, 440, 880, 110]) {
    let result
    for (let frame = 256; frame <= 12288; frame += 256) {
      result = tracker.analyze(makeSignal(frequency, sampleRate, 4096, [1], frame - 4096), sampleRate, Math.min(4096, frame), 440, 256)
    }
    assert.ok(result.valid)
    assert.ok(Math.abs(1200 * Math.log2(result.frequency / frequency)) < 1)
    const silentTail = makeSignal(frequency, sampleRate, 4096)
    silentTail.fill(0, 3584)
    assert.equal(tracker.analyze(silentTail, sampleRate).valid, false)
  }
})

test('uses fewer samples for high notes while retaining bass accuracy', () => {
  const tracker = createPitchTracker()
  let result
  const high = makeSignal(440, 48000, 4096)
  for (let i = 0; i < 20; i++) result = tracker.analyze(high, 48000)
  assert.equal(result.windowSize, 512)
  const low = makeSignal(41.2034, 48000, 4096)
  for (let i = 0; i < 50; i++) result = tracker.analyze(low, 48000)
  assert.equal(result.windowSize, 4096)
  assert.ok(Math.abs(1200 * Math.log2(result.frequency / 41.2034)) < 1)
})

test('keeps quiet clean notes usable without repeatedly retriggering at the volume threshold', () => {
  const tracker = createPitchTracker()
  const source = makeSignal(375, 48000, 4096)
  const signal = (amplitude) => Float32Array.from(source, (sample) => sample * amplitude / .15)
  let result
  for (let i = 0; i < 50; i++) result = tracker.analyze(signal(.004), 48000)
  assert.ok(result.valid, 'A quiet clean string should acquire')
  assert.ok(result.windowSize >= 2048, 'Weak notes should use a longer window')
  for (let i = 0; i < 20; i++) result = tracker.analyze(signal(.0027), 48000)
  assert.ok(result.valid, 'Tracking should survive a small level decrease')
  assert.equal(tracker.analyze(signal(.0023), 48000).valid, false)
  for (let i = 0; i < 30; i++) assert.equal(tracker.analyze(signal(.0027), 48000).valid, false)
  for (let i = 0; i < 50; i++) result = tracker.analyze(signal(.004), 48000)
  assert.ok(result.valid, 'A new clean attack should reacquire')
})

test('reports per-update CPU cost against the original fixed-window detector', () => {
  const signal = makeSignal(440, 48000, 4096)
  const fixed = createMPMDetector(4096)
  const tracker = createPitchTracker()
  for (let i = 0; i < 100; i++) { analyzePitch(fixed, signal, 48000); tracker.analyze(signal, 48000) }
  const count = 1000
  let start = performance.now()
  for (let i = 0; i < count; i++) analyzePitch(fixed, signal, 48000)
  const fixedMs = (performance.now() - start) / count
  start = performance.now()
  for (let i = 0; i < count; i++) tracker.analyze(signal, 48000)
  const adaptiveMs = (performance.now() - start) / count
  console.log('DETECTOR_CPU_BENCHMARK', JSON.stringify({ frequency: 440, fixedMs, adaptiveMs, updates: count }))
})
