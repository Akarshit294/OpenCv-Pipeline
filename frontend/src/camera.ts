// Test page only. In Xebit's room the candidate's click on the camera button makes LiveKit open
// the camera, and our code is handed the track. Nothing in this file moves.

/** What LiveKit asks a camera for by default (its h720 preset), so this page gets the picture the
 *  room gets. Bare numbers are wishes, not demands: the camera gives its closest match. */
const ROOM_CAPTURE: MediaTrackConstraints = {
  width: 1280,
  height: 720,
  frameRate: 30,
  aspectRatio: 16 / 9,
};

export async function openCamera(): Promise<MediaStream> {
  // Browsers only let a page reach the camera when it is served from https or from localhost.
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This page cannot use a camera. Open it from https or from localhost.");
  }
  return navigator.mediaDevices.getUserMedia({ video: ROOM_CAPTURE, audio: false });
}

/** Turns what the browser threw into a sentence a person can act on. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return (
      "Camera permission was refused. Allow the camera for this page from the address bar, and " +
      "for the browser in System Settings → Privacy & Security → Camera, then try again."
    );
  }
  if (name === "NotFoundError") return "No camera was found on this machine.";
  if (name === "NotReadableError") {
    return "The camera could not be started. Another app may be using it.";
  }
  return error instanceof Error ? error.message : String(error);
}
