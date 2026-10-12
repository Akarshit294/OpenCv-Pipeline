import { useEffect, useRef, useState } from "react";
import { formatBytes, formatCount, mean } from "./format";
import { startSampler, type Sample, type Sampler } from "./sampler";

const WIDTHS = [160, 320, 640, 1280];
/** How many of the latest samples the averages are taken over. */
const RECENT = 10;

/** What the page read back from the canvas after one copy. */
type PixelRead = {
  /** How long getting every pixel back as numbers took. */
  ms: number;
  /** How many numbers came back. */
  bytes: number;
  /** The pixel at the centre of the frame: where it is, and its four numbers. */
  x: number;
  y: number;
  rgba: [number, number, number, number];
};

/** One sample, and the read that followed it when reading back is switched on. */
type Reading = Sample & { read: PixelRead | null };

/** Reads the frame on the canvas back as numbers. A frame is one flat list of bytes: four for
 *  each pixel (red, green, blue, alpha, each 0 to 255), one row after another from the top left. */
function readFrame(canvas: HTMLCanvasElement, sample: Sample): PixelRead {
  const context = canvas.getContext("2d"); // the same context the sampler draws with
  if (!context) throw new Error("The canvas has no 2D drawing context.");

  const startedAt = performance.now();
  const { data } = context.getImageData(0, 0, sample.width, sample.height);
  const ms = performance.now() - startedAt;

  const x = Math.floor(sample.width / 2);
  const y = Math.floor(sample.height / 2);
  const first = (y * sample.width + x) * 4; // y whole rows, then x pixels, at 4 bytes each
  const rgba: PixelRead["rgba"] = [data[first], data[first + 1], data[first + 2], data[first + 3]];
  return { ms, bytes: data.length, x, y, rgba };
}

/** The sampled frame, its controls and its numbers. Test page only; the sampler it drives is the
 *  part that moves. */
export function SampledFrame({ track }: { track: MediaStreamTrack }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplerRef = useRef<Sampler | null>(null);
  const [rate, setRate] = useState(2);
  const [width, setWidth] = useState(320);
  const [readBack, setReadBack] = useState(true);
  const [recent, setRecent] = useState<Reading[]>([]);

  // One sampler for the life of this track. `rate` and `width` are left out of the list below on
  // purpose: the two effects after this one pass a change to the running sampler, so moving a
  // control does not restart it. Switching reading on or off does restart it, on a new canvas:
  // once pixels have been read from a canvas, the browser keeps it in main memory for good.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sampler = startSampler({
      track,
      canvas,
      rate,
      width,
      onSample: (sample) => {
        const read = readBack ? readFrame(canvas, sample) : null;
        setRecent((before) => [...before.slice(1 - RECENT), { ...sample, read }]);
      },
    });
    samplerRef.current = sampler;
    return () => {
      sampler.stop();
      samplerRef.current = null;
    };
  }, [track, readBack]);

  useEffect(() => {
    samplerRef.current?.setRate(rate);
  }, [rate]);

  useEffect(() => {
    samplerRef.current?.setWidth(width);
  }, [width]);

  const latest = recent.at(-1);
  const gaps = recent.flatMap((each) => (each.gapMs === null ? [] : [each.gapMs]));
  const meanGap = mean(gaps);
  const meanDraw = mean(recent.map((each) => each.drawMs));
  const meanRead = mean(recent.flatMap((each) => (each.read ? [each.read.ms] : [])));
  // Held the way a canvas holds a frame: 4 bytes for every pixel.
  const bytesPerFrame = latest ? latest.width * latest.height * 4 : 0;

  return (
    <section>
      <h2>Sampled frame</h2>
      {/* The key makes React build a new canvas element when reading is switched on or off. */}
      <canvas key={readBack ? "read-back" : "draw-only"} ref={canvasRef} />
      <div className="controls">
        <label>
          Rate
          <input
            type="range"
            min={1}
            max={30}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
          />
          <span>{rate} a second</span>
        </label>
        <label>
          Width
          <select value={width} onChange={(event) => setWidth(Number(event.target.value))}>
            {WIDTHS.map((each) => (
              <option key={each} value={each}>
                {each} px
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={readBack}
            onChange={(event) => {
              setReadBack(event.target.checked);
              setRecent([]); // the numbers so far came from the other canvas
            }}
          />
          Read pixels back
        </label>
      </div>
      {latest && (
        <>
          <dl>
            <dt>Frame</dt>
            <dd>{latest.seq + 1}</dd>
            <dt>Size</dt>
            <dd>
              {latest.width} × {latest.height}
            </dd>
            <dt>Captured at</dt>
            <dd>{(latest.capturedAt / 1000).toFixed(3)} s on the page's clock</dd>
            <dt>Gap</dt>
            <dd>
              {latest.gapMs === null ? "—" : `${latest.gapMs.toFixed(1)} ms`}, asked for{" "}
              {(1000 / rate).toFixed(1)} ms
            </dd>
            <dt>Rate achieved</dt>
            <dd>
              {meanGap === null ? "—" : `${(1000 / meanGap).toFixed(2)} a second`}, over the last{" "}
              {gaps.length} gaps
            </dd>
            <dt>As plain pixels</dt>
            <dd>
              {formatCount(latest.width * latest.height)} pixels × 4 bytes ={" "}
              {formatBytes(bytesPerFrame)} a frame
            </dd>
            <dt>Every second</dt>
            <dd>{meanGap === null ? "—" : formatBytes((bytesPerFrame * 1000) / meanGap)}</dd>
            <dt>Centre pixel</dt>
            <dd>
              {latest.read ? (
                <>
                  <span
                    className="swatch"
                    style={{ background: `rgb(${latest.read.rgba.slice(0, 3).join(" ")})` }}
                  />
                  red {latest.read.rgba[0]}, green {latest.read.rgba[1]}, blue{" "}
                  {latest.read.rgba[2]}, alpha {latest.read.rgba[3]}, at ({latest.read.x},{" "}
                  {latest.read.y})
                </>
              ) : (
                "not read"
              )}
            </dd>
            <dt>Draw</dt>
            <dd>
              {latest.drawMs.toFixed(1)} ms, mean {meanDraw?.toFixed(2)} ms
            </dd>
            <dt>Read</dt>
            <dd>
              {latest.read
                ? `${latest.read.ms.toFixed(1)} ms for ${formatCount(latest.read.bytes)} numbers, ` +
                  `mean ${meanRead?.toFixed(2)} ms`
                : "switched off"}
            </dd>
          </dl>
          <p className="note">
            Draw is how long the copy call took to return. Read is how long getting every pixel back
            as numbers took. A camera frame lives on the graphics card. While pixels are read back,
            the browser keeps this canvas in main memory instead, and every draw then has to bring
            the whole camera frame down first. Untick “Read pixels back” to see the draw alone.
          </p>
        </>
      )}
    </section>
  );
}
