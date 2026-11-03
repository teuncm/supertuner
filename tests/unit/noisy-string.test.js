import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPitchTracker } from '../../src/scripts/pitch-tracker.js'
import { getPitchWindowSize } from '../../src/scripts/constants.js'
import { limitAnalysisPeak } from '../../src/scripts/peak-limiter.js'
import { recordedStringWithNoise, filterInput } from '../fixtures/noisy-string.js'

for (const seed of [1, 17, 1234, 9001]) {
test(`recorded string fading into noise stays stable (noise seed ${seed})`, () => {
  const recording = recordedStringWithNoise(seed)
  const { sampleRate } = recording
  const signal = filterInput(recording.signal, sampleRate)
  const size = getPitchWindowSize(sampleRate)
  const tracker = createPitchTracker()
  const snapshot = new Float32Array(size)
  let valid = 0
  let wrongNotes = 0
  let largeJumps = 0
  let reacquisitions = 0
  let previous = null
  let wasValid = false
  for (let end = size; end <= signal.length; end += 512) {
    snapshot.set(signal.subarray(end - size, end))
    limitAnalysisPeak(snapshot)
    const result = tracker.analyze(snapshot, sampleRate, size, 440, 512)
    if (result.valid) {
      valid++
      if (!wasValid) reacquisitions++
      if (result.midiNumber !== 59) wrongNotes++
      if (previous && Math.abs(1200 * Math.log2(result.frequency / previous)) > 15) largeJumps++
      previous = result.frequency
    }
    wasValid = result.valid
  }
  console.log('NOISY_RECORDED_STRING', JSON.stringify({ seed, valid, wrongNotes, largeJumps, reacquisitions }))
  assert.ok(valid > 50, 'A usable section of the recorded string must be detected')
  assert.equal(wrongNotes, 0)
  assert.equal(largeJumps, 0)
  assert.ok(reacquisitions <= 3, `Repeated threshold retriggering: ${reacquisitions}`)
})
}
