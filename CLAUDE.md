# CLAUDE.md — OpenCV-Pipeline

## What this repo is

A test bench for giving Xebit's examiner agent sight. Today that agent teaches in modules and tests
candidates in assessments over a meeting, on audio alone. Here we work out how it can also see the
candidate through their camera, built so the useful parts can move into Xebit with few changes.

Nothing in this repo ships as it is. "What moves into Xebit" below names the parts written to be
lifted out.

**Read `PLAN.md` before doing anything.** It has the phases, which step is current, the decisions
already made and the questions still open. When a step is finished or a decision changes, update
it in the same piece of work.

There is no code yet. Add a Commands section here when the first command exists; do not list a
command that has not been run.

## How to work here

The owner knows backends and voice agents well and is new to computer vision. They want to
understand every piece that goes in, so:

- **Write from scratch.** A teammate's prototype exists (see "Related code"). Read it to learn
  which traps exist; never copy from it. Some of its choices are not the ones wanted here.
- **Explain before writing.** The first time an idea appears (a landmark, a blendshape, a worker),
  say what it is in a sentence or two and why this step needs it.
- **Small pieces.** Add code a little at a time and explain each piece as it lands. Never drop in
  a large finished file.
- **Every step ends with something to look at** — on the page or in the terminal.
- **Do the current step in `PLAN.md` and stop.** Do not build later steps early, even when they
  look easy.
- **Plain version first.** Build the simple thing, let its problem show, then fix it. Example: run
  the model on the page's main thread and watch the page stutter before moving it into a worker.
- Comparisons to their audio pipeline help (voice-activity detection, debounce, one pipeline per
  track): they built it.

## Scope

- **In:** Xebit's self-hosted meeting room — the LiveKit room a candidate joins through the
  dashboard page. That page is ours, so our code can run in it.
- **Out:** meetings on Meet, Zoom or Teams joined through a Recall bot. None of our code runs on
  the candidate's side there.
- **To be tested, not yet designed:** a group of people in one room on a single camera.

## What runs where

| Piece | Where | Why |
|---|---|---|
| Camera capture, frame sampling, the MediaPipe models | Browser — `frontend/`, TypeScript | The page is ours: no server CPU, no video plumbing |
| Per-frame output → events (the rules) | Backend — `backend/`, Python | Thresholds change without a frontend release, recordings can be replayed, and Xebit's reducer takes events in Python |
| Heavier models, a Gemini look at a frame | Backend, on an occasional snapshot | Too heavy for a candidate's laptop |
| A room of people | Not decided | Faces may be too small for the browser models; test first |

Design rules that follow from this:

- **The browser sends per-frame output, not events.** Events are made in the backend.
- **An event is a change of state, not a frame**: "looking away started", "looking away ended",
  with who and when. Per-frame numbers stay internal.
- **Keep a snapshot of what is true now** beside the event stream. A consumer that joins late
  must not have to replay history.
- **Events are facts, not judgements.** The pipeline says "looked away for 12 seconds". What that
  means is the agent's decision.
- **Drop a late frame; never queue it.** A reading that arrives late is worth nothing.
- **Event-based at the output, plain function calls inside.** No queues between pipeline stages.
- **Cheap models decide when expensive ones run.**
- **Numbers from the candidate's machine can be faked.** Never treat them as the only evidence
  for an assessment result.

## Layout (planned — only the two `.md` files and `README.md` exist today)

```
frontend/      TypeScript: camera, frame sampling, MediaPipe, overlay, live event feed
backend/
  vision/      the part written to move into xebit-api: message shapes, rules, events
  server       WebSocket endpoint — stands in for the meeting room's data channel
  tests/       recordings replayed through the rules
lab/           Python + OpenCV experiments the browser cannot answer (the room clip, snapshots)
recordings/    recorded per-frame output and clips — gitignored
```

## Conventions

- **Python** follows xebit-api, so code moves over without restyling: Python 3.12, `uv` (never
  pip), Pydantic v2 for anything that crosses the wire, type hints on every function, async for
  all I/O, absolute imports, `logger = logging.getLogger(__name__)`. Run tests with the venv's
  interpreter, not a bare `pytest`.
- **TypeScript** is strict. The frontend is React so the overlay and the event feed can move into
  the dashboard.
- **One message contract.** The shape of a per-frame message is defined once in the backend
  (Pydantic) and the frontend's types mirror it. Change both in the same commit.
- **Keep `backend/vision/` free of transport.** It must not know about WebSockets, web pages or
  files; everything around it is throwaway.

## Constraints

- **The dev machine is an Intel Mac** (x86_64; Python 3.12 through uv, Node 24). Recent PyTorch
  has no build for it, so an add-on model must run on ONNX Runtime or as a MediaPipe task.
- **OpenCV has no job in the browser path** — the camera API and a canvas do capture, resize and
  drawing. OpenCV is for `lab/` only.
- **Licences.** This is headed for a commercial product: no AGPL models or code (Ultralytics YOLO
  is AGPL).
- **Emotion detection is an experiment only.** The classifiers are unreliable, and the EU AI Act
  bans inferring emotions from faces in workplace and education settings (Article 5(1)(f)). Build
  on observable behaviour instead; get legal advice before any product use.
- **Recordings are measurements of a person's face and body.** Keep them in `recordings/`, never
  commit them, never print message bodies in logs.

## Related code

- **Xebit** — `/Users/Admin/Documents/work/xebit/`: `xebit-api` (FastAPI, the meeting runtime),
  `xebit-dashboard` (Next.js, where the room page lives), `xebit-browser`. Each has a `CLAUDE.md`;
  read the relevant one before claiming how something would plug in.
- **The teammate's prototype** — `/Users/Admin/Documents/personal/Mediapipe` ("xebit-vision").
  MediaPipe in the browser at 2 frames a second, raw output over a data channel, a rules layer.
  A reference for traps and measurements. Its numbers come from still photos on another machine;
  treat them as claims to check, not facts.

## What moves into Xebit

- `frontend/`'s capture-and-model code → `xebit-dashboard`, beside `src/components/livekit-room.tsx`.
  Its `send` becomes a publish on the room's data channel.
- `backend/vision/` → `xebit-api`. Its events go to the reducer.
- Thrown away at that point: the test page around the camera, the WebSocket server, the recording
  tools.
