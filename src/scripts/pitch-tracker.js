import { analyzePitch, createMPMDetector } from './detection.js'
import { MIN_VOLUME_DB } from './constants.js'

const sizes = [512, 1024, 2048, 4096, 8192, 16384, 32768]
const minimumPower = 10 ** (MIN_VOLUME_DB / 10)
// Reopen 2 dB above the release floor to avoid repeatedly acquiring a dying
// string. Signals within 20 dB of that floor use stricter periodicity checks.
const acquisitionPower = minimumPower * 10 ** (2 / 10)
const weakSignalPower = minimumPower * 100
const empty = Object.freeze({ valid: false, frequency: 0, clarity: 0, cents: 0, noteName: '--', targetFrequency: 0 })

// Reuse FFT plans. Normally keep three periods (2.5 at the lowest bass range) and verify against
// the full window so a strong upper harmonic cannot permanently capture tracking.
export function createPitchTracker() {
  const detectors = new Map()
  let previousFrequency = 0
  let activeSamples = 0
  let sinceVerification = 4096
  let gateOpen = false
  let weakCandidate = 0
  let weakCandidateSamples = 0
  let weakConfirmed = false
  return {
    analyze(buffer, sampleRate, available = buffer.length, reference = 440, advanced = 256) {
      const tailLength = Math.min(buffer.length, available, Math.max(512, Math.ceil(2 * sampleRate / (previousFrequency || 100))))
      let power = 0
      let recentPower = 0
      for (let i = buffer.length - tailLength; i < buffer.length; i++) {
        const samplePower = buffer[i] * buffer[i]
        power += samplePower
        if (i >= buffer.length - 512) recentPower += samplePower
      }
      const averagePower = power / tailLength
      if (!tailLength || recentPower / Math.min(512, tailLength) < minimumPower * 0.25 || averagePower < (gateOpen ? minimumPower : acquisitionPower)) {
        gateOpen = false
        weakCandidate = 0
        weakCandidateSamples = 0
        weakConfirmed = false
        activeSamples = 0
        sinceVerification = 4096
        return empty
      }
      gateOpen = true
      const weak = averagePower < weakSignalPower
      activeSamples = Math.min(available, activeSamples + advanced)
      const usable = Math.min(available, activeSamples)
      const largest = sizes.findLastIndex((size) => size <= buffer.length)
      let first = previousFrequency ? sizes.findIndex((size) => size >= 3 * sampleRate / previousFrequency) : 0
      if (first < 0) first = largest
      first = Math.min(first, largest)
      if (weak) first = Math.max(first, Math.min(largest, sizes.findIndex((size) => size >= sampleRate * 0.035)))
      let result = empty
      let selected = -1
      const detect = (index) => {
        const size = sizes[index]
        if (size > usable) return empty
        if (!detectors.has(size)) detectors.set(size, createMPMDetector(size))
        const reading = analyzePitch(detectors.get(size), buffer.subarray(buffer.length - size), sampleRate, reference)
        const periods = index === largest ? 2.5 : 3
        return reading.valid && (!weak || reading.clarity >= (weakConfirmed ? 0.97 : 0.99)) && reading.frequency * size >= periods * sampleRate ? reading : empty
      }
      for (let index = first; index <= largest; index++) {
        result = detect(index)
        if (result.valid) { selected = index; break }
      }
      // A higher new note can be acquired before the old low-note window clears.
      if (!result.valid && first > 0 && !weak) {
        for (let index = 0; index < first; index++) {
          result = detect(index)
          if (result.valid) { selected = index; break }
        }
      }
      sinceVerification += advanced
      if (result.valid && selected < largest && sinceVerification >= sampleRate * 0.045 && usable >= sizes[largest]) {
        const verification = detect(largest)
        sinceVerification = 0
        if (verification.valid && verification.frequency < result.frequency && verification.clarity >= result.clarity - 0.015) {
          const ratio = result.frequency / verification.frequency
          if (ratio >= 1.9 && Math.abs(1200 * Math.log2(ratio / Math.round(ratio))) < 35) {
            result = verification
            selected = largest
          }
        }
      }
      if (weak) {
        if (!result.valid) {
          weakCandidate = 0
          weakCandidateSamples = 0
          weakConfirmed = false
          return empty
        }
        const jump = previousFrequency && Math.abs(1200 * Math.log2(result.frequency / previousFrequency)) > 20
        if (!weakConfirmed || jump) {
          // Require 25 ms of consistent weak pitch before making it live.
          if (weakCandidate && Math.abs(1200 * Math.log2(result.frequency / weakCandidate)) <= 8) weakCandidateSamples += advanced
          else { weakCandidate = result.frequency; weakCandidateSamples = advanced }
          if (weakCandidateSamples < sampleRate * 0.025) return empty
          weakConfirmed = true
        }
      } else {
        weakCandidate = 0
        weakCandidateSamples = 0
        weakConfirmed = false
      }
      if (result.valid) previousFrequency = result.frequency
      return result.valid ? { ...result, windowSize: sizes[selected] } : empty
    },
  }
}
