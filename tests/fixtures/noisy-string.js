import { readFileSync } from 'node:fs'

export function recordedStringWithNoise(seed = 1234) {
  const wav = readFileSync(new URL('./guitar-mf-b3.wav', import.meta.url))
  const sampleRate = wav.readUInt32LE(24)
  let offset = 12
  while (wav.toString('ascii', offset, offset + 4) !== 'data') offset += 8 + wav.readUInt32LE(offset + 4) + wav.readUInt32LE(offset + 4) % 2
  const length = wav.readUInt32LE(offset + 4) / 2
  const recorded = Float32Array.from({ length }, (_, i) => wav.readInt16LE(offset + 8 + i * 2) / 32768)
  const totalLength = Math.ceil(sampleRate * 9)
  const signal = new Float32Array(totalLength)
  let colored = 0
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1 }
  for (let i = 0; i < signal.length; i++) {
    const time = i / sampleRate
    const white = random()
    colored = colored * .96 + white * .04
    const noise = white * .0008 + colored * .002 + .0002 * Math.sin(2 * Math.PI * 50 * time)
    // Progressively move the real recording through the detector's noise floor.
    const decay = 3 * Math.exp(-time / 1.35)
    const transient = time > 5.5 && time < 5.512 ? .0015 * random() : 0
    signal[i] = (recorded[i] ?? 0) * decay + noise + transient
  }
  return { signal, sampleRate }
}

// Offline equivalent of the native 20 Hz high-pass input filter (Q = 0 dB).
export function filterInput(signal, sampleRate) {
  const omega = 2 * Math.PI * 20 / sampleRate
  const cosine = Math.cos(omega)
  const alpha = Math.sin(omega) / 2
  const a0 = 1 + alpha
  const b0 = (1 + cosine) / 2 / a0
  const b1 = -(1 + cosine) / a0
  const a1 = -2 * cosine / a0
  const a2 = (1 - alpha) / a0
  const output = new Float32Array(signal.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i]
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
    output[i] = y
    x2 = x1; x1 = x; y2 = y1; y1 = y
  }
  return output
}
