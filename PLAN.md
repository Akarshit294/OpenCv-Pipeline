# Plan

Last updated: 2026-10-12 · **Status: Phase 1 is built and checked with Chrome's synthetic camera.
Still to do: look at it with a real camera. Phase 2 is next.**

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
| No fixed frame rate: each model runs at the rate its signal needs, inside a CPU budget on the candidate's machine | How fast a model must run depends on how fast the thing it watches changes (seconds for a raised hand, several times a second for a moving mouth). The laptop is also running the call, so vision backs off before the call suffers. |
| The sampler is handed a camera track and never opens the camera | In the room LiveKit opens and publishes the camera when the candidate clicks the camera button, so only code that takes a track can move there. |
| An assessment starts with the candidate's camera on; Xebit is to be changed for that later | The owner's call. Today the room's camera is off until the candidate clicks it, and with it off there is nothing to analyse. |
| The camera is used for two things: the conversation, and checking that a candidate is not cheating in an assessment | The owner's call. |

## Phase 1 — Frontend basics

The camera on a page, and a frame as something you can hold.

- [x] 1.1 Create `frontend/` (Vite + React + TypeScript, at xebit-dashboard's React and TypeScript
      versions) with one page, and a root `.gitignore`.
- [x] 1.2 Ask for the camera at 1280×720, the size the room's LiveKit capture asks for. Show it in
      a video element with the size and frame rate the camera actually gave. Handle "permission
      refused". This code is the test page's own: in the room, LiveKit opens the camera and hands
      us the track.
- [x] 1.3 A sampler that is given a camera track. At a rate set by a slider (start at 2 a second),
      copy the current frame onto a canvas whose width is set by a selector (start at 320 px), and
      show it beside the video. Stamp each copy with its capture time and show the actual gap
      between copies.
- [x] 1.4 Look at one frame as numbers: its width and height, 4 bytes a pixel, the value of one
      pixel. Time the draw and the pixel read separately.

**Done when** the page shows the live camera with its real size, and beside it the small frame
updating at the chosen rate and width, with a frame counter, the gap between copies, and the time
each draw and read took.

**You will understand** what a frame is, why we sample instead of using every frame, and why the
model sees a much smaller picture than the camera gives.

**Found** (headless Chrome 154 on the dev machine, with Chrome's synthetic 1280×720 camera; check
again on a real camera):

- Copying a frame onto a canvas costs the page about 0.5 ms, as long as nobody reads that canvas's
  pixels. After two `getImageData` calls Chrome moves the canvas into main memory for good, and
  every later copy costs about 12 ms whatever its width, because the whole camera frame has to be
  brought down from the graphics card first.
- A camera gives what it can, not what was asked: asked for 30 frames a second, the synthetic one
  gave 20. Sampling faster than the camera delivers only copies the same frame twice.
- A timer is not a clock: asked for 30 copies a second, the page made 30.4, because the browser
  cuts the 33.3 ms period down to a whole 33.

## Phase 2 — MediaPipe on those frames

- [ ] 2.1 Load the face model on the page's main thread. Run it on each sampled frame and print
      the raw result.
- [ ] 2.2 Draw the face points over the video. Show live: how many faces, head rotation, a few
      blendshape scores (`jawOpen`, `eyeBlinkLeft`, `eyeLookDownLeft`).
- [ ] 2.3 Measure the time each frame takes in the model at 2, 5 and 10 frames a second, and watch
      what each rate does to the page.
- [ ] 2.4 Add the pose model. Draw the skeleton; show where the wrists are against the eyes.
- [ ] 2.5 Add the object detector behind a switch. Draw its boxes and scores.
- [ ] 2.6 Move the models into a background worker, with one frame in flight at a time: if the
      worker is busy, skip the tick.
- [ ] 2.7 Report state: running, paused (tab hidden, camera off), failed. A track stopped by its
      owner fires no event and never comes back, so "camera off" is read from the track itself on
      each tick, and a camera turned on again arrives as a new track (see "Getting it into Xebit").
- [ ] 2.8 Pace each model by a budget instead of one fixed rate. A page cannot read CPU usage, so
      cap our share of one core with the inference time we already measure: the gap between
      frames is the larger of "what the signal needs" (the face model up to about 10 a second,
      pose and objects slower) and "inference time ÷ budget" (start the budget at 20% of a core;
      a value to tune). Report the rate actually achieved. Test it by loading the machine
      artificially and watching the rate fall.
      Later overrides, not part of this step: the call reporting it is CPU-limited (the WebRTC
      stat `qualityLimitationReason`; testable only once there is a call) and the Compute
      Pressure API (Chrome and Edge only). Either one drops the rate to its floor at once, and it
      climbs back slowly.

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
- Ours, from Phase 1: never read pixels back from the sampler's canvas (`getImageData`). A couple
  of reads make every later copy about 20 times slower, for good. While the model runs on the page
  (2.1–2.5), hand it the canvas itself. A canvas cannot cross to a worker, so 2.6 needs a
  different hand-off, likely an `ImageBitmap` made from the frame; measure what that costs.

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
- [ ] Replay one recording at lower rates by dropping frames, to find the lowest rate each rule
      still works at.

Four things to design in from the start, where the prototype's rules fall short:

- **Time in seconds, not frames.** The frame rate differs between machines and changes during a
  session, so a hold is "1.5 seconds", read from each message's capture time, never "3 frames".
- **A baseline for each person.** "Looking away" measured against the camera with fixed angles
  fires all the time for a webcam off to one side. Learn each person's resting head angles first.
- **Holds that forgive one bad frame.** If a single noisy frame restarts a 6-second count, the
  event rarely fires. Ask for "most of the last 6 seconds", not "every frame for 6 seconds".
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
- **Slim the message:** send only what the rules read. Needed sooner if the face model runs at
  10 a second: the prototype's full message is 9.2 KB, so about 90 KB a second.
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
- The room opens the camera only when the candidate clicks the camera button (`toggleCamera`,
  which calls LiveKit's `setCameraEnabled`), at LiveKit's default of 1280×720 and 30 a second, and
  publishes it. The sampler would be given that track's `mediaStreamTrack`. The room mirrors the
  self-view with CSS only, so the pixels stay unmirrored.
- Turning the camera off stops that `mediaStreamTrack` for good, and turning it on again fetches a
  new one: LiveKit keeps its own track object and emits `Restarted` on it. The room code has to
  hand the sampler the new track each time. A sampler left holding the old one stays silent.
- The room's data channel already carries `control`, `chat`, `transcription` and `activity`
  topics; the bridge relays `control` to the API. A `vision` topic would take the same path.
- The prototype's README advises keeping a message on that channel under 15,000 bytes. Its
  default message (one body, one face, no face mesh) measured 9.2 KB.
- In `xebit-api`, events would enter the demo_v2 reducer as runtime events, with a standing
  context item for the router so the agent knows what is true now.

## Open questions

1. ~~**Scope wording.**~~ Answered: "self-hosted" means the LiveKit room. Xebit's own code uses the
   word for it (`xebit-dashboard/src/components/meeting-form.tsx` labels the option "Xebit Meet
   (Self-hosted)").
2. **Which signals does the agent act on, and what does it do with each?** The pipeline reports
   facts; someone has to decide what the examiner does on "looked away for 12 seconds". The use is
   decided (see "Decisions so far"); which signals, and what the examiner does on each, is not.
   Answer before 3.2: it decides which rules are worth writing.
3. **How far to trust numbers from the candidate's own machine** in an assessment, and what the
   spot-check has to prove. Answer before 3.2, because cheating checks are part of the use. A
   server-side look at the camera track catches tampered numbers, not a faked camera feed.
4. **The room of people:** browser or server? Needs the clip first.
5. **What rate does each model need, and what share of the CPU is safe to take** on a laptop that
   is also running the call? Step 2.3 and the reduced-rate replay in 3.2 answer it. The 320 px
   frame width is also the prototype's value, untested here.
6. **What the candidate is told and agrees to** before their camera is analysed.
7. **Emotion detection:** legal advice before it goes anywhere near a product.
