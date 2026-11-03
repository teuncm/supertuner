import { test, expect } from '@playwright/test'

test('measures synthesized audio onset to pitch result', async ({ page }) => {
  test.skip(Boolean(process.env.TUNER_TEST_PREVIEW), 'This source-module benchmark runs against the development server.')
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const { createPitchEngine } = await import('/src/scripts/engine.js')
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    const destination = context.createMediaStreamDestination()
    oscillator.connect(volume).connect(destination)
    volume.gain.value = 0
    oscillator.start()
    await context.resume()
    let pending = null
    const engine = await createPitchEngine(destination.stream, (reading) => {
      if (!pending || !reading?.valid) return
      const error = 1200 * Math.log2(reading.frequency / pending.frequency)
      if (Math.abs(error) <= 1) {
        pending.resolve({ frequency: pending.frequency, latencyMs: performance.now() - pending.started, errorCents: error })
        pending = null
      }
    }, (message) => { throw new Error(message) })
    const results = []
    try {
      for (const frequency of [41.2034, 82.4069, 110, 220, 440, 880, 1760]) {
        volume.gain.value = 0
        await new Promise((resolve) => setTimeout(resolve, 180))
        oscillator.frequency.value = frequency
        const result = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`No accurate result for ${frequency} Hz`)), 2000)
          pending = { frequency, started: performance.now(), resolve: (value) => { clearTimeout(timeout); resolve(value) } }
        })
        volume.gain.value = 0.2
        results.push(await result)
      }
    } finally {
      engine.stop()
      destination.stream.getTracks().forEach((track) => track.stop())
      await context.close()
    }
    return results
  })
  console.log('ONSET_BENCHMARK', JSON.stringify(results))
  for (const result of results) expect(Math.abs(result.errorCents)).toBeLessThanOrEqual(1)
})
