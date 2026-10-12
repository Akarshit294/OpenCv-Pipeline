# Plan

Last updated: 2026-10-12 · **Status: no code yet. Phase 1 is next.**

## Goal

Xebit's examiner agent runs over a meeting on audio alone. We want it to see the candidate: is
someone there, are they alone, are they looking at the screen, have they raised a hand, is there a
phone. This repo finds out what works, in a shape that can move into Xebit.

A second scenario is to be tested after the first works: the agent talking to a group of people
sitting in one room, seen through a single camera.

## Decisions so far

| Decision | Why |
|---|---|
| Only Xebit's self-hosted room (LiveKit), not Recall meetings | The owner's scope call. It is what makes the next line possible. |
| The MediaPipe models run in the candidate's browser | The page is ours. No server CPU, and no need to pull every candidate's video to the server and decode it. |
| The rules that turn per-frame output into events run in the Python backend | Thresholds change without a frontend release; recordings can be replayed; Xebit's reducer takes events in Python. |
| The browser sends per-frame output, not events | Follows from the line above. |
| A WebSocket between page and backend in this repo | The data is a steady stream and events have to come back down. It stands in for the room's data channel. |
| One repo: `frontend/` in TypeScript, `backend/` in Python | Same split as Xebit, so each half has an obvious place to move to. |
| Written from scratch | The owner wants to understand every piece. The teammate's prototype is a reference only. |
| No OpenCV in the browser path | The camera API and a canvas already capture, resize and draw. OpenCV is used in `lab/`. |
| Emotion detection is an experiment only | Unreliable, and legally restricted for exactly this use (EU AI Act, Article 5(1)(f)). |

## Phase 1 — Frontend basics

The camera on a page, and a frame as something you can hold.

- [ ] 1.1 Create `frontend/` (Vite + React + TypeScript) with one page.
- [ ] 1.2 Ask for the camera and show it in a video element. Handle "permission refused".
- [ ] 1.3 Twice a second, copy the current frame onto a canvas 320 px wide and show that canvas
      beside the video.
- [ ] 1.4 Look at one frame as numbers: its width and height, 4 bytes a pixel, the value of one
      pixel. Time how long the copy takes.

**Done when** the page shows the live camera, and beside it the small frame updating twice a
second with a frame counter and the time each copy took.

**You will understand** what a frame is, why we sample instead of using every frame, and why the
model sees a much smaller picture than the camera gives.

## Phase 2 — MediaPipe on those frames

- [ ] 2.1 Load the face model on the page's main thread. Run it on each sampled frame and print
      the raw result.
- [ ] 2.2 Draw the face points over the video. Show live: how many faces, head rotation, a few
      blendshape scores (`jawOpen`, `eyeBlinkLeft`, `eyeLookDownLeft`).
- [ ] 2.3 Measure the time each frame takes in the model, and watch what it does to the page.
- [ ] 2.4 Add the pose model. Draw the skeleton; show where the wrists are against the eyes.
- [ ] 2.5 Add the object detector behind a switch. Draw its boxes and scores.
- [ ] 2.6 Move the models into a background worker, with one frame in flight at a time: if the
      worker is busy, skip the tick.
- [ ] 2.7 Report state: running, paused (tab hidden, camera off), failed.

**Done when** the overlay sits on your face and body, the numbers move when you move, the page
stays smooth, and the time per frame is on screen.

**You will understand** landmarks, blendshapes, the head-rotation matrix, a detector against a
landmark model, and why inference belongs off the main thread.

**Watch for** (met by the teammate's prototype; check each one ourselves):

- The video-mode call needs timestamps that only ever increase.
- Video mode follows the body from the previous frame, and at 2 frames a second that is half a
  second ago. If landmarks lag behind a fast move, use image mode.
- A frame handed to a worker has to be released afterwards or memory grows.
- Browsers slow timers in hidden tabs, so "no output" must mean "paused", not "broken".
- The model files and the library's own runtime files must be served from our own origin.
- The picture is not mirrored: left and right are the person's own.
- Their README gives head yaw as positive toward the person's own left, and says the up/down sign
  of pitch was never confirmed. Confirm both on a live face.

## Phase 3 — Backend: record, rules, events

### 3.1 Transport and recording

- [ ] Create `backend/` (Python 3.12, uv, FastAPI) with one WebSocket endpoint.
- [ ] Define the message shapes once, in Pydantic: a frame message and a status message. Mirror
      them in the frontend's types.
- [ ] The backend validates every message and writes it as one line to a file in `recordings/`.
- [ ] The frontend sends each frame's output; if the socket is not open, drop it.

**Done when** moving in front of the camera for a minute leaves a recording that can be read back.

### 3.2 Rules

- [ ] A pure function: one frame's output in, plain signals out (a face is present, how many
      faces, wrist above the eyes, head angles, a phone was seen).
- [ ] A per-person detector that turns signals over time into start and end events.
- [ ] A replay script that feeds a recording through the rules and prints the events; tests built
      on it.
- [ ] One rule end to end first (present / absent). Then: hand raised, more than one person,
      looking away, phone.

Three things to design in from the start, where the prototype's rules fall short:

- **A baseline for each person.** "Looking away" measured against the camera with fixed angles
  fires all the time for a webcam off to one side. Learn each person's resting head angles first.
- **Holds that forgive one bad frame.** If a single noisy frame restarts a 6-second count, the
  event rarely fires. Count "most of the last N frames", not "N in a row".
- **Know which face is the candidate** when two are in view, instead of reading the first one.

**Done when** replaying a recording gives the same events every time, and they match what
happened in front of the camera.

### 3.3 Events back to the page

- [ ] Send events down the same WebSocket.
- [ ] Show a live feed and one tile per condition on the page.
- [ ] Send the current state when a page connects, so a late joiner sees what is true now.

**Done when** raising a hand lights its tile within about two seconds and the feed shows the start
and the end.

## After phase 3

Not in a fixed order; pick by what phase 3 shows.

- **Tune on real faces:** several people, glasses, poor light, a webcam off to one side.
- **Other browsers and weak laptops:** Safari, Firefox, and a machine that cannot hold 2 frames a
  second while also running a call.
- **Slim the message:** send only what the rules read.
- **Stack a second model in the browser** and measure what it costs in download and CPU.
- **A Gemini look at a frame,** compared against the rules on the same moments.
- **An independent spot-check.** To catch faked numbers the server needs a frame it took itself
  from the published camera track, not one the page uploaded. Xebit's bridge deliberately does
  not subscribe to human cameras today.
- **An emotion model,** to see how noisy it is. Experiment only.

## Side lab — `lab/`, Python + OpenCV

For what the browser cannot answer, mainly the room of people. It needs one real clip of 4–6
people in a meeting room, captured as the far side of the call receives it.

1. Run face and person detectors over the clip, draw boxes, print face widths in pixels. That
   decides which later steps are possible.
2. Tracking: a stable number for each person across the clip.
3. Coarse signals: headcount, hand raised, facing the screen.
4. Gemini on the same frames, compared with step 3.
5. Who is speaking — only if step 1 shows faces large enough and a higher frame rate is available.

Checked on this machine without installing: `mediapipe 0.10.21`, `opencv-python 4.11`,
`onnxruntime 1.23`, `numpy 1.26` resolve together on Python 3.12.

## Getting it into Xebit

Notes for later, from reading Xebit's `CLAUDE.md` files. Verify against the code at the time.

- The room page is `xebit-dashboard/src/components/livekit-room.tsx`. It is also rendered on
  public, signed-out routes, so the vision code cannot depend on a signed-in user.
- The room's data channel already carries `control`, `chat`, `transcription` and `activity`
  topics; the bridge relays `control` to the API. A `vision` topic would take the same path.
- The prototype's README advises keeping a message on that channel under 15,000 bytes. Its
  default message (one body, one face, no face mesh) measured 9.2 KB.
- In `xebit-api`, events would enter the demo_v2 reducer as runtime events, with a standing
  context item for the router so the agent knows what is true now.

## Open questions

1. **Scope wording.** "Self-hosted" is taken here to mean the LiveKit room. Confirm.
2. **Which signals does the agent act on, and what does it do with each?** The pipeline reports
   facts; someone has to decide what the examiner does on "looked away for 12 seconds".
3. **How far to trust numbers from the candidate's own machine** in an assessment, and what the
   spot-check has to prove.
4. **The room of people:** browser or server? Needs the clip first.
5. **Frame rate and frame width.** 2 a second and 320 px are the prototype's values, untested here.
6. **What the candidate is told and agrees to** before their camera is analysed.
7. **Emotion detection:** legal advice before it goes anywhere near a product.
