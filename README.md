# Supertuner

The best mobile-friendly tuning tool found [here](https://teuncm.nl/supertuner).

A minimal chromatic tuner with a single horizontal ±50-cent bar and a microphone
button centered in a full-screen, softly blurred overlay. The large button
disappears with the overlay once audio capture is flowing,
including silence between notes; stopping remains available in settings.
The bar turns green when a valid pitch falls within
the configurable ±1–25-cent tolerance (default ±4 cents, adjustable in 0.1-cent steps). The scientific note
name is centered above the taller needle display, with subtle ticks inside the
bar and numeric labels every 10 cents below it. The last pitch and note remain visible for three
seconds after detection stops, then clear to a dash. During the hold only the
note label fades to 35% opacity; the needle stays fully visible and green clears
immediately. A dash is also shown before
the first detection;
settings are tucked behind the header settings icon.
Dark mode is the default; the header theme toggle remembers your preference.
The layout starts with a centered phone view, stacked settings, 44 px touch
targets, safe-area spacing and a compact landscape layout, then expands on desktop.
Neutral colors follow the [Radix Gray scales](https://www.radix-ui.com/colors),
with green reserved for an in-tune reading.
Notes use C, C♯, D, E♭, E, F, F♯, G, G♯, A, B♭, B. Bravura supplies the
accidental glyphs, paired with DejaVu Sans Mono letters and numbers. Both fonts
are bundled locally. Compact fixed slots reserve room for the letter, accidental
and octave, using normal font spacing and baseline alignment without outline compensation.

## Development

```sh
npm ci
npm run dev
```

Microphone access requires localhost or HTTPS. Click **Start listening** and play
one note at a time. A4 reference pitch is adjustable from 435 to 445 Hz.

## Audio and rendering

- Vue 3.6.0-rc.14, pinned, with pure Vapor components and `createVaporApp`.
- An AudioWorklet captures on the audio clock, typically every 256 samples
  (5.3 ms at 48 kHz). A direct MessageChannel sends snapshots to the MPM worker;
  PCM does not pass through the UI thread. One transferable snapshot in flight
  provides backpressure, so slow analysis drops intermediate snapshots instead
  of building up latency. A 10 ms polling fallback supports older browsers.
- Cached MPM detectors select shorter windows for higher pitches: at 48 kHz,
  A4 normally uses 512 samples (10.7 ms), A3 uses 1,024 (21.3 ms), and E2 uses
  2,048 (42.7 ms). Bass notes retain the full 4,096-sample window. Larger windows
  at higher sample rates preserve bass coverage. Periodic full-window checks
  reduce harmonic locking; bass FFTs run less often to avoid redundant work.
- A native 20 Hz high-pass filter reduces DC drift and subsonic rumble before
  sensitivity gain. Weak signals use at least a 35 ms analysis window, stricter
  clarity (0.99 to acquire, 0.97 to sustain) and 25 ms of consistent pitch before
  becoming live. The audio level gate reopens 2 dB above its release floor to
  reduce repeated acquisition as a string fades into noise. Unreliable readings
  use the existing three-second display hold.
- A WebGL shader draws the range, scale and current pitch indicator. Drawing is
  scheduled on demand with `requestAnimationFrame`, independently of analysis.
  Results are coalesced into one UI update per frame. ResizeObserver removes
  per-frame layout measurements, and idle tuners have no animation loop.
- Displayed pitch uses a three-sample median to reject isolated spikes and a
  70 ms exponential smoother for small fluctuations. Confirmed large note
  changes snap promptly. A three-second display hold preserves the last detected
  pitch through silence; stopping the session clears it immediately. The green state still
  compares displayed cents directly with the selected tolerance, with no
  hysteresis or delayed boundary switching.
  Smoothing history survives detection gaps up to 120 ms so brief weak-signal
  dropouts do not cause the next estimate to snap the needle.
- Note-name changes have a separate six-cent deadband around semitone midpoints,
  preventing neighboring names from alternating due to tiny pitch fluctuations.
- WebGL context loss switches to a CSS meter and restoration restores WebGL.
- The labeled Sensitivity slider adjusts input gain from 1× to 20×, starting
  at 15× gain. Before detection, a worker-side peak limiter uniformly scales
  analysis windows whose peak exceeds 0.95. Quiet windows are unchanged, and
  uniform scaling preserves each window's waveform shape without clipping or
  extra look-ahead latency. This is an analysis-window limiter, not a continuous
  playback limiter, and cannot repair clipping already present at the microphone.
  Low-volume
  and low-clarity frames clear the reading; capture timestamps reject results
  older than 120 ms. Hidden or suspended sessions pause capture and clear pitch.
- Stop listening releases the microphone, worker and audio context.

## Validation

```sh
npm run build
npx playwright install chromium
npm test
npm run bench:latency
```

Browser tests use synthesized microphone input to exercise pitch deviation,
tolerance, silence, reference changes, microphone lifecycle, theme persistence,
mobile layout, denied permissions and WebGL fallback/recovery. To run them
against a production build, set `TUNER_TEST_PREVIEW=1` before `npm test`.

Unit tests cover pure tones, strong harmonics and missing fundamentals from
30.87 to 1,760 Hz at 44.1, 48 and 96 kHz. The latency benchmark measures generated
audio onset to the first pitch result within one cent, after engine startup.
It excludes physical microphone/driver latency and display scanout; it does not
establish parity with a hardware tuner.

Noise regression tests also use a real University of Iowa classical-guitar
recording mixed with deterministic broadband/colored noise, mains hum and a
short transient. They check wrong notes, large pitch jumps, threshold retriggering,
and continued detection of a usable portion of the string's decay. Provenance and
conversion details are in [tests/fixtures/README.md](tests/fixtures/README.md).
The added noise is modeled; this does not substitute for the user's actual room,
instrument and microphone.

Example local Chromium runs before/after the optimization:

| Tone | Previous onset to result | Optimized onset to result |
| --- | ---: | ---: |
| E2, 82.41 Hz | 150 ms | 66 ms |
| A3, 220 Hz | 146 ms | 44 ms |
| A4, 440 Hz | 49 ms | 22 ms |

Timing varies with browser, device and scheduling. The local A4 detector CPU
benchmark fell from approximately 0.26 to 0.054 ms per update, including periodic
full-window verification. This is per-update cost, not total CPU utilization;
the optimized engine produces results more frequently.
