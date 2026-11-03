import { test } from 'node:test'
import assert from 'node:assert/strict'
import { limitAnalysisPeak, LIMITER_CEILING } from '../../src/scripts/peak-limiter.js'
import { analyzePitch, createMPMDetector } from '../../src/scripts/detection.js'

test('leaves silence and quiet audio unchanged', () => {
  for (const values of [[0, 0, 0], [-.2, .1, .8]]) {
    const buffer = new Float32Array(values)
    const original = buffer.slice()
    assert.equal(limitAnalysisPeak(buffer), 1)
    assert.deepEqual(buffer, original)
  }
})

test('limits loud peaks with uniform gain reduction rather than flattened samples', () => {
  const buffer = new Float32Array([-15, -7.5, 0, 3, 12])
  const original = buffer.slice()
  const gain = limitAnalysisPeak(buffer)
  assert.ok(gain < 1)
  for (let i = 0; i < buffer.length; i++) {
    assert.ok(Math.abs(buffer[i]) <= LIMITER_CEILING + 1e-7)
    assert.ok(Math.abs(buffer[i] - original[i] * gain) < 1e-7)
  }
  assert.equal(limitAnalysisPeak(buffer), 1)
})

test('retains musical pitch under high sensitivity across bass and treble', () => {
  for (const sampleRate of [44100, 48000]) {
    for (const frequency of [41.2034, 82.4069, 220, 440, 880, 1760]) {
      const buffer = Float32Array.from({ length: 4096 }, (_, i) => {
        const phase = 2 * Math.PI * frequency * i / sampleRate
        return 15 * (.4 * Math.sin(phase) + .15 * Math.sin(2 * phase))
      })
      const detector = createMPMDetector(buffer.length)
      const original = analyzePitch(detector, buffer, sampleRate)
      limitAnalysisPeak(buffer)
      const limited = analyzePitch(detector, buffer, sampleRate)
      assert.ok(limited.valid)
      assert.ok(Math.abs(1200 * Math.log2(limited.frequency / frequency)) < 1)
      assert.ok(Math.abs(1200 * Math.log2(limited.frequency / original.frequency)) < 0.01)
    }
  }
})
