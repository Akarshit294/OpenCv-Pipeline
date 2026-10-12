import { useEffect, useState } from "react";
import { describeCameraError, openCamera } from "./camera";
import { CameraView } from "./CameraView";
import { SampledFrame } from "./SampledFrame";

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const track = stream?.getVideoTracks()[0] ?? null;

  async function turnOn() {
    setProblem(null);
    setOpening(true);
    try {
      setStream(await openCamera());
    } catch (error) {
      console.error("Camera could not be opened", error);
      setProblem(describeCameraError(error));
    } finally {
      setOpening(false);
    }
  }

  function turnOff() {
    // Stopping the tracks is what releases the camera and puts its light out.
    stream?.getTracks().forEach((each) => each.stop());
    setStream(null);
  }

  // A camera can also go away by itself: unplugged, or its permission taken back.
  useEffect(() => {
    if (!track) return;
    const onEnded = () => {
      console.warn("Camera track ended by itself");
      setStream(null);
      setProblem("The camera stopped.");
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [track]);

  return (
    <main>
      <header>
        <h1>Vision test bench</h1>
        <button onClick={stream ? turnOff : turnOn} disabled={opening}>
          {stream ? "Turn camera off" : opening ? "Asking for the camera…" : "Turn camera on"}
        </button>
      </header>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {stream && track ? (
        <div className="columns">
          <CameraView stream={stream} track={track} />
          <SampledFrame track={track} />
        </div>
      ) : (
        <p className="note">The camera is off. Nothing is captured until you turn it on.</p>
      )}
    </main>
  );
}
