// Moves into xebit-dashboard. It is handed a camera track; it never opens, changes or stops one.

/** One copied frame. Times are milliseconds on the page's own clock (`performance.now()`), which
 *  only ever goes forward. The wall clock can be set back; this one cannot. */
export interface Sample {
  /** Counts copies since the sampler started, from 0. */
  seq: number;
  /** When the frame was copied. Rules downstream measure "for how long" from this. */
  capturedAt: number;
  /** Time since the copy before this one; null for the first. */
  gapMs: number | null;
  /** Size of the copy, in pixels. */
  width: number;
  height: number;
  /** How long the copy call took to return. */
  drawMs: number;
}

export interface SamplerOptions {
  /** A camera track the caller already has. */
  track: MediaStreamTrack;
  /** Where each frame is copied to. */
  canvas: HTMLCanvasElement;
  /** Copies a second: above 0 and at most 60. */
  rate: number;
  /** Width of the copy in pixels, at least 1. The height follows the camera's shape, and the copy
   *  is never made wider than the camera's own picture. */
  width: number;
  /** Called after each copy, while that frame is still on the canvas. */
  onSample: (sample: Sample) => void;
}

export interface Sampler {
  /** A rate or width the sampler cannot use throws, and the sampler carries on as it was. */
  setRate(rate: number): void;
  setWidth(width: number): void;
  stop(): void;
}

/** No camera we expect delivers more frames a second than this. Without a ceiling, a runaway rate
 *  would run the browser's timer at its floor, 250 times a second. */
const MAX_RATE = 60;

export function startSampler(options: SamplerOptions): Sampler {
  const { track, canvas, onSample } = options;
  // Both are checked before anything is created, so a bad starting value leaves nothing behind.
  let width = checkedWidth(options.width);
  const firstPeriod = periodMs(options.rate);
  let seq = 0;
  let lastCapturedAt: number | null = null;
  let stopped = false;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser gave no 2D drawing context for the canvas.");

  // A track has no "give me the current frame" call that every browser supports. A <video>
  // element playing the track always holds the latest frame, and a canvas can copy from it. The
  // element is never added to the page.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]); // wraps the track; does not copy or change it
  video.play().catch((error: unknown) => {
    // Stopping before playback began rejects this promise; that is not a fault.
    if (!stopped) console.error("Sampler could not play the camera track", error);
  });

  const tick = () => {
    // The track is not delivering a picture: stopped by its owner, switched off, or cut off at
    // its source. The <video> would still hand over a black frame, so do not sample one. A
    // stopped track fires no event, which is why this is looked at on every tick.
    if (track.readyState !== "live" || !track.enabled || track.muted) return;
    // The camera has not delivered a frame yet: skip this tick rather than wait for one.
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return;

    const copyWidth = Math.min(width, video.videoWidth);
    const copyHeight = Math.round((copyWidth * video.videoHeight) / video.videoWidth);
    // Setting a canvas's size also wipes it, so only touch it when the size really changes.
    if (canvas.width !== copyWidth || canvas.height !== copyHeight) {
      canvas.width = copyWidth;
      canvas.height = copyHeight;
    }

    const capturedAt = performance.now();
    context.drawImage(video, 0, 0, copyWidth, copyHeight); // copies and resizes in one call
    const drawMs = performance.now() - capturedAt;

    const gapMs = lastCapturedAt === null ? null : capturedAt - lastCapturedAt;
    lastCapturedAt = capturedAt;
    onSample({ seq: seq++, capturedAt, gapMs, width: copyWidth, height: copyHeight, drawMs });
  };

  let timer = setInterval(tick, firstPeriod);

  return {
    setRate(rate) {
      if (stopped) return;
      const period = periodMs(rate); // throws on a bad rate, before the running timer is touched
      clearInterval(timer);
      timer = setInterval(tick, period);
    },
    setWidth(next) {
      width = checkedWidth(next);
    },
    stop() {
      stopped = true;
      clearInterval(timer);
      video.srcObject = null;
    },
  };
}

/** The time between copies at a rate, or an error for a rate the sampler will not run at. */
function periodMs(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_RATE) {
    throw new RangeError(
      `Sampling rate must be above 0 and at most ${MAX_RATE} a second, got ${rate}`,
    );
  }
  return 1000 / rate;
}

/** A width in whole pixels, or an error for a width nothing can be drawn at. */
function checkedWidth(width: number): number {
  if (!Number.isFinite(width) || width < 1) {
    throw new RangeError(`Sample width must be at least 1 pixel, got ${width}`);
  }
  return Math.round(width);
}
