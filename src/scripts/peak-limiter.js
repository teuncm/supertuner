export const LIMITER_CEILING = 0.95

// Detection consumes independent windows, so limit each window with one linear
// gain reduction. This preserves its waveform shape without sample clipping or
// additional look-ahead buffering. Quiet windows keep the selected sensitivity.
export function limitAnalysisPeak(buffer) {
  let peak = 0
  for (let i = 0; i < buffer.length; i++) peak = Math.max(peak, Math.abs(buffer[i]))
  if (peak <= LIMITER_CEILING) return 1
  const gain = LIMITER_CEILING / peak
  for (let i = 0; i < buffer.length; i++) buffer[i] *= gain
  return gain
}
