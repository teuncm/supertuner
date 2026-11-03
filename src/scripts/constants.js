export const A4_FREQUENCY = 440
export const MAX_A4_FREQUENCY = 445
export const MIN_A4_FREQUENCY = 435
export const FFT_SIZE = 4096
export function getPitchWindowSize(sampleRate) {
  return FFT_SIZE * 2 ** Math.max(0, Math.ceil(Math.log2(sampleRate / 48000)))
}
export const IN_TUNE_CENTS = 4
export const MAX_CENTS = 50
export const MAX_TARGET_ACCURACY_CENTS = 25
export const MIN_CLARITY = 0.9
export const MIN_VOLUME_DB = -55
