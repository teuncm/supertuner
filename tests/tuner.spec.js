import { test, expect } from '@playwright/test'

async function syntheticMicrophone(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      const destination = context.createMediaStreamDestination()
      oscillator.frequency.value = 440
      volume.gain.value = 0.2
      oscillator.connect(volume).connect(destination)
      oscillator.start()
      await context.resume()
      window.testTone = { context, oscillator, volume, stream: destination.stream }
      return destination.stream
    }
  })
}

test('defaults to dark mode and remembers the header theme toggle', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('status')).toHaveText('Ready when you are')
  await expect(page.locator('.note-name')).toHaveText('—')
  await expect(page.locator('.note-name')).toBeVisible()
  await expect(page.locator('.pitch-canvas')).toHaveClass(/ready/)
  await expect(page.locator('footer, .wordmark, .section-caption, .meter-headings, .meter-labels')).toHaveCount(0)
  await expect(page.getByRole('slider', { name: 'Sensitivity' })).toHaveCount(0)
  const microphone = await page.getByRole('button', { name: 'Start listening' }).boundingBox()
  const bar = await page.getByRole('meter').boundingBox()
  const viewport = page.viewportSize()
  expect(microphone.width).toBeGreaterThanOrEqual(120)
  expect(Math.abs(microphone.y + microphone.height / 2 - viewport.height / 2)).toBeLessThan(1)
  expect(Math.abs(microphone.x + microphone.width / 2 - bar.x - bar.width / 2)).toBeLessThan(1)
  await page.getByRole('button', { name: 'Start listening' }).focus()
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeFocused()
  await page.screenshot({ path: 'test-results/tuner-dark-idle.png' })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(errors).toEqual([])
})

test('MPM worker tracks cents, tolerance, silence, reference changes and stop/restart', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.pitchWorkletCreated = false
    const OriginalNode = window.AudioWorkletNode
    window.AudioWorkletNode = class extends OriginalNode {
      constructor(...args) { super(...args); window.pitchWorkletCreated = true }
    }
    const createAnalyser = BaseAudioContext.prototype.createAnalyser
    window.pitchAnalyserCount = 0
    BaseAudioContext.prototype.createAnalyser = function (...args) {
      window.pitchAnalyserCount++
      return createAnalyser.apply(this, args)
    }
  })
  await syntheticMicrophone(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByRole('status')).toHaveText('In tune')
  await expect(page.locator('.microphone-button')).toBeHidden()
  expect(await page.evaluate(() => window.pitchWorkletCreated && window.pitchAnalyserCount === 0)).toBe(true)
  await expect(page.locator('.note-name')).toHaveText('A')
  await expect(page.locator('.octave')).toHaveText('4')
  await expect(page.locator('.pitch-readout')).toHaveCSS('opacity', '1')
  await expect(page.locator('.tuning-display')).toHaveClass(/is-tuned/)
  await page.evaluate(() => { window.testTone.oscillator.frequency.value = 440 * 2 ** (12 / 1200) })
  await expect(page.getByRole('status')).toHaveText('Too sharp · tune down')
  await expect(page.locator('.tuning-display')).not.toHaveClass(/is-tuned/)
  await expect.poll(async () => Number(await page.getByRole('meter').getAttribute('aria-valuenow'))).toBeCloseTo(12, 0)
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await page.getByRole('slider', { name: 'In-tune range' }).fill('15')
  await expect(page.getByRole('status')).toHaveText('In tune')
  await page.getByRole('slider', { name: 'In-tune range' }).fill('4')
  await page.evaluate(() => { window.testTone.oscillator.frequency.value = 440 * 2 ** (-12 / 1200) })
  await expect(page.getByRole('status')).toHaveText('Too flat · tune up')
  await page.evaluate(() => { window.testTone.volume.gain.value = 0 })
  await expect(page.locator('.pitch-readout')).toHaveClass(/is-held/)
  await expect(page.locator('.pitch-readout')).toHaveCSS('opacity', '0.35')
  await expect(page.locator('.note-name')).toHaveText('A')
  await expect(page.locator('.octave')).toHaveText('4')
  await expect(page.getByRole('status')).toHaveText('Listening for a note')
  await expect(page.locator('.note-name')).toHaveText('—')
  await expect(page.locator('.octave')).toHaveText('')
  await expect(page.locator('.pitch-readout')).not.toHaveClass(/is-held/)
  await expect(page.locator('.microphone-button')).toBeHidden()
  await expect(page.locator('.tuning-display')).not.toHaveClass(/is-tuned/)
  await page.getByRole('spinbutton', { name: 'Reference pitch' }).fill('442')
  await page.evaluate(() => { window.testTone.oscillator.frequency.value = 442; window.testTone.volume.gain.value = 0.2 })
  await expect(page.getByRole('status')).toHaveText('In tune')
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await page.screenshot({ path: 'test-results/tuner-dark-tuned.png' })
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await page.getByRole('button', { name: 'Stop listening' }).click()
  await expect(page.getByRole('status')).toHaveText('Ready when you are')
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeVisible()
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  expect(await page.evaluate(() => window.testTone.stream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true)
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.locator('.note-name')).toHaveText('A')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.screenshot({ path: 'test-results/tuner-light.png' })
  expect(errors).toEqual([])
})

test('works without WebGL on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' ? null : getContext.call(this, type, ...args)
    }
  })
  await syntheticMicrophone(page)
  await page.goto('/')
  await expect(page.locator('.meter-fallback')).toBeVisible()
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByRole('status')).toHaveText('In tune')
  await expect(page.locator('.fallback-needle')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/tuner-mobile-fallback.png' })
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => {
      const label = document.querySelector('.pitch-readout').getBoundingClientRect()
      const bar = document.querySelector('.tuning-display').getBoundingClientRect()
      const scale = document.querySelector('.deviation-scale').getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        centerOffset: Math.abs((bar.left + bar.right) / 2 - innerWidth / 2),
        labelOffset: Math.abs((label.left + label.right) / 2 - (bar.left + bar.right) / 2),
        fitsVertically: label.top >= 0 && scale.bottom <= innerHeight,
      }
    })
    expect(layout.overflow).toBe(false)
    expect(layout.centerOffset).toBeLessThan(1)
    expect(layout.labelOffset).toBeLessThan(1)
    expect(layout.fitsVertically).toBe(true)
    await page.screenshot({ path: `test-results/tuner-mobile-${viewport.width}.png` })
  }
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await expect(page.getByRole('slider', { name: 'Sensitivity' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('spinbutton', { name: 'Reference pitch' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/tuner-mobile-settings.png' })
})

test('explains denied microphone access and allows retry', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByRole('alert')).toContainText('Allow microphone access')
  await expect(page.getByRole('button', { name: 'Start listening' })).toBeEnabled()
})

test('falls back on WebGL context loss and recovers', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.pitch-canvas')).toHaveClass(/ready/)
  await page.evaluate(() => {
    window.testGL = document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context')
    window.testGL.loseContext()
  })
  await expect(page.locator('.meter-fallback')).toBeVisible()
  await page.evaluate(() => window.testGL.restoreContext())
  await expect(page.locator('.pitch-canvas')).toHaveClass(/ready/)
  await expect(page.locator('.meter-fallback')).toHaveCount(0)
})

test('retains pitch detection when AudioWorklet is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get() { return undefined } })
  })
  await syntheticMicrophone(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByRole('status')).toHaveText('In tune')
  await page.evaluate(() => { window.testTone.oscillator.frequency.value = 220 })
  await expect(page.locator('.octave')).toHaveText('3')
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await page.getByRole('button', { name: 'Stop listening' }).click()
  await expect(page.getByRole('status')).toHaveText('Ready when you are')
})

test('sensitivity lifts a quiet note above the detection threshold', async ({ page }) => {
  await syntheticMicrophone(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.getByRole('status')).toHaveText('In tune')
  const liveColor = await page.locator('.tuning-display').evaluate((element) => getComputedStyle(element).backgroundColor)
  await page.evaluate(() => { window.testTone.volume.gain.value = 0.000162 })
  await expect(page.locator('.tuning-display')).toHaveClass(/is-held/)
  await expect(page.locator('.tuning-display')).not.toHaveClass(/is-tuned/)
  expect(await page.locator('.tuning-display').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(liveColor)
  await expect(page.getByRole('status')).toHaveText('Listening for a note')
  await page.getByRole('button', { name: 'Tuner settings' }).click()
  await page.getByRole('slider', { name: 'Sensitivity' }).fill('20')
  await expect(page.getByRole('status')).toHaveText('In tune')
  await expect(page.locator('.tuning-display')).not.toHaveClass(/is-held/)
  await expect(page.locator('.tuning-display')).toHaveCSS('background-color', liveColor)
  await page.getByRole('slider', { name: 'Sensitivity' }).fill('1')
  await expect(page.getByRole('status')).toHaveText('Listening for a note')
})

test('renders Bravura accidentals in compact fixed slots with normal font alignment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await syntheticMicrophone(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start listening' }).click()
  await expect(page.locator('.note-name')).toHaveText('A')
  await page.evaluate(() => document.fonts.ready)
  const initial = await page.locator('.scientific-note').boundingBox()
  for (const [midi, letter, accidental] of [[64, 'E', ''], [65, 'F', ''], [70, 'B', '♭'], [71, 'B', ''], [73, 'C', '♯'], [75, 'E', '♭']]) {
    await page.evaluate((value) => { window.testTone.oscillator.frequency.value = 440 * 2 ** ((value - 69) / 12) }, midi)
    await expect(page.locator('.note-name')).toHaveText(letter)
    await expect(page.locator('.accidental')).toHaveText(accidental)
    await page.evaluate(() => document.fonts.ready)
    const current = await page.locator('.scientific-note').boundingBox()
    expect(current.x + current.width / 2).toBeCloseTo(195, 0)
    expect(current.width).toBeCloseTo(initial.width, 1)
    if (!accidental) {
      expect(await page.locator('.accidental').textContent()).toBe('')
    }
    if (accidental) {
      expect(await page.evaluate(() => document.fonts.check('32px "Supertuner Music"', '♯♭'))).toBe(true)
      await expect(page.locator('.accidental')).toHaveCSS('font-family', /Supertuner Music/)
      await page.screenshot({ path: `test-results/tuner-note-${midi}.png` })
    }
  }
})
