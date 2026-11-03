import { describePitch } from './detection.js'

// Smooth in musical (log-frequency) space. A three-sample median rejects single
// spikes; a 70 ms exponential filter steadies small fluctuations. Confirmed
// changes larger than 80 cents snap to the new pitch rather than gliding notes.
export function createPitchSmoother() {
  const history = new Float64Array(3)
  let count = 0
  let index = 0
  let previousTime = 0
  let smoothed = 0
  let labeledMidi
  function reset() { count = 0; index = 0; previousTime = 0; smoothed = 0; labeledMidi = undefined }
  return {
    reset,
    update(reading, now, reference = 440) {
      // A brief dropout must not turn the next weak estimate into a fresh snap.
      if (!reading?.valid) return reading
      if (count && now - previousTime > 120) reset()
      const pitch = 1200 * Math.log2(reading.frequency)
      history[index] = pitch
      index = (index + 1) % 3
      count = Math.min(count + 1, 3)
      const median = count === 3
        ? history[0] + history[1] + history[2] - Math.min(...history) - Math.max(...history)
        : history[0]
      if (count === 1 || Math.abs(median - smoothed) >= 80) smoothed = median
      else {
        const elapsed = Math.min(32, Math.max(0, now - previousTime))
        smoothed += (median - smoothed) * (1 - Math.exp(-elapsed / 70))
      }
      previousTime = now
      const displayed = describePitch(2 ** (smoothed / 1200), reading.clarity, reference, labeledMidi)
      labeledMidi = displayed.midiNumber
      return { ...reading, ...displayed }
    },
  }
}
