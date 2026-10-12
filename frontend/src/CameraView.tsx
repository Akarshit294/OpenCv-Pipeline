import { useEffect, useRef } from "react";
import { formatBytes, formatCount } from "./format";

/** The live camera and what it actually delivers. Test page only. */
export function CameraView({ stream, track }: { stream: MediaStream; track: MediaStreamTrack }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // A stream is a live object, not a URL, so it cannot go in the `src` attribute. It is handed to
  // the element here, once the element exists.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // What the camera settled on, which can differ from what was asked for.
  const { width = 0, height = 0, frameRate = 0 } = track.getSettings();
  // Held the way a canvas holds a frame: 4 bytes for every pixel.
  const bytesPerFrame = width * height * 4;

  return (
    <section>
      <h2>Camera</h2>
      <video ref={videoRef} autoPlay playsInline muted />
      <dl>
        <dt>Device</dt>
        <dd>{track.label}</dd>
        <dt>Picture</dt>
        <dd>
          {width} × {height}, {Math.round(frameRate)} frames a second
        </dd>
        <dt>As plain pixels</dt>
        <dd>
          {formatCount(width * height)} pixels × 4 bytes = {formatBytes(bytesPerFrame)} a frame
        </dd>
        <dt>Every second</dt>
        <dd>{formatBytes(bytesPerFrame * frameRate)}</dd>
      </dl>
      <p className="note">
        Not mirrored. This is the picture the models will get, so it moves the opposite way to a
        mirror.
      </p>
    </section>
  );
}
