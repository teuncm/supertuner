import { createPitchTracker } from './pitch-tracker.js'
import { limitAnalysisPeak } from './peak-limiter.js'

const tracker = createPitchTracker()
let reference = 440
let nextAnalysisFrame = 0
let advancedSinceAnalysis = 0
function analyze(data, channel) {
  const { buffer, sampleRate, available, frame, advanced } = data
  advancedSinceAnalysis += advanced
  if (channel && frame < nextAnalysisFrame) {
    channel.postMessage({ buffer }, [buffer.buffer])
    return
  }
  try {
    limitAnalysisPeak(buffer)
    const reading = tracker.analyze(buffer, sampleRate, available, reference, advancedSinceAnalysis)
    advancedSinceAnalysis = 0
    // Long bass windows need fewer overlapping FFTs; capture remains audio-clocked.
    nextAnalysisFrame = frame + (reading.windowSize ?? 0) / 8
    if (channel) {
      channel.postMessage({ buffer }, [buffer.buffer])
      self.postMessage({ reading, audioTime: frame / sampleRate })
    } else self.postMessage({ buffer, reading }, [buffer.buffer])
  } catch {
    if (channel) channel.postMessage({ buffer }, [buffer.buffer])
    self.postMessage({ error: true })
  }
}
self.onmessage = ({ data }) => {
  if (data.type === 'reference') reference = data.value
  else if (data.type === 'connect') {
    const channel = data.port
    channel.onmessage = ({ data: samples }) => analyze(samples, channel)
    channel.start()
  } else analyze(data)
}
