# GameGarage

A browser-based game platform built with FastAPI and Kontra.js. Games run in the browser and communicate over a shared WebSocket relay for multiplayer.

Currently includes: **8-Ball Pool**

---

## Stack

- **Backend:** Python / FastAPI + Uvicorn
- **Frontend:** Vanilla ES modules, [Kontra.js](https://straker.github.io/kontra/) for the game loop
- **Multiplayer:** WebSocket broadcast relay (`/ws`)
- **Audio:** Web Audio API (sound effects) + HTML5 Audio (music)

---

## Project Structure

```
.
├── main.py                  # FastAPI server — static file serving + WebSocket relay
├── requirements.txt         # Python dependencies
├── templates/
│   └── menu.html            # Game selection menu
├── static/
│   ├── controller.html      # Phone gamepad controller UI
│   └── controller.js        # Joystick input → WebSocket messages
└── games/
    ├── resources/
    │   └── music.mp3        # Background music shared across games
    └── pool/
        ├── pool.js          # Entry point — exports default init function
        ├── physics.js       # Fixed-timestep physics engine (120 Hz)
        ├── renderer.js      # Pseudo-3D projection + canvas drawing
        ├── ui.js            # All HTML screens: lobby, room, HUD, result
        ├── network.js       # WebSocket wrapper with room-code filtering
        ├── scoring.js       # Turn logic, foul detection, win conditions
        ├── audio.js         # Sound effects and background music
        ├── constants.js     # Every constant used across the pool game
        └── poolscreenshot.png
```

---

## Setup

**Requirements:** Python 3.10+

```bash
pip install -r requirements.txt
```

---

## Running

```bash
uvicorn main:app --reload --port 8081
```

Then open `http://localhost:8081`.

---

## How the Menu Works

`menu.html` scans the `/games` directory at page load. Any subfolder that contains a matching `<name>.js` file appears as a game card. Selecting a game dynamically imports that module and calls its default export:

```js
const scene = await import('./games/pool/pool.js');
scene.default({ canvas, context, name, kontra });
```

The default export must return a Kontra `Scene` object with an `id` matching the folder name. Adding a new game is as simple as creating a new subfolder with a matching entry-point JS file and a screenshot PNG.

---

## WebSocket Architecture

`main.py` exposes a single WebSocket at `/ws` that acts as a **pure broadcast relay** — every message received is forwarded verbatim to all connected clients. There is no server-side room logic.

Room isolation is handled entirely on the client. Every outgoing message includes a `roomCode` field; every incoming handler discards messages whose `roomCode` doesn't match the local session. This means two separate games can run simultaneously on the same server without interfering, as long as their room codes differ.

---

## 8-Ball Pool

### Game Modes

| Mode | Description |
|---|---|
| **vs AI** | Single-player against a CPU opponent. Three difficulty levels: Easy, Medium, Hard. |
| **Local 2-Player** | Two players share the same screen and keyboard/mouse. |
| **Online Multiplayer** | Two players connect remotely via room code over the WebSocket relay. |

### Controls

| Action | Input |
|---|---|
| Aim | Move the mouse around the cue ball |
| Set power | Click and drag away from the cue ball |
| Shoot | Release the mouse button |
| Place cue ball (ball-in-hand) | Click anywhere on the table |
| Mute / unmute | Click the 🔊 button in the HUD |

### Online Multiplayer Flow

1. Player 1 enters a name, clicks **Create Room** — a 6-character room code is generated.
2. Player 1 shares the code with Player 2.
3. Player 2 enters their name and the code, clicks **Join Room**.
4. Once both players are in the room, Player 1 (host) clicks **Start Game**.
5. Player 1 always breaks first.

### Rules

Standard 8-ball rules:
- First legal pocket after the break assigns **solids** (1–7) or **stripes** (9–15) to the shooter.
- Pocket all balls in your group, then legally pocket the **8 ball** to win.
- Pocketing the 8 ball before clearing your group, or scratching while pocketing the 8 ball, is an instant loss.

**Fouls** (opponent gets ball-in-hand):
- Cue ball pocketed (scratch)
- No ball contacted on the shot
- Wrong group hit first after assignment
- No rail contact after the cue ball hits an object ball

### AI Difficulty

| Level | Behavior |
|---|---|
| Easy | Only attempts shots within ~45° cut angle; low power; significant aiming noise |
| Medium | Attempts any angle; moderate power cap; standard aiming noise |
| Hard | Attempts any angle; avoids scratch-risk shots; best position play; minimal aiming noise |

---

## Module Reference (Pool Game)

### `constants.js`
All numeric and string constants. No functions. Every magic number in the codebase lives here — table geometry, ball physics, pocket positions, cue settings, network config, and ball colors.

### `physics.js`
Self-contained fixed-timestep physics engine running at 120 Hz internal ticks inside the browser's variable-rate game loop. Uses typed flat arrays for all ball state. Features:
- Spatial hash broad-phase collision detection
- Impulse-based narrow-phase resolution with positional correction (Baumgarte)
- Continuous Collision Detection (CCD) to prevent tunneling on hard break shots
- Rail bounce with restitution
- Pocket detection
- Spin-to-linear-velocity transfer

### `renderer.js`
Pseudo-3D projection — the 2D table is drawn at an angle to simulate depth. All drawing goes through a `project(x, y)` function that compresses the Y axis and applies a perspective offset. Draws 3D-extruded rails, pocket holes as ellipses, ball shadows, stripe bands, number labels, and specular highlights. Ball draw order is sorted by Y so nearer balls appear in front.

### `ui.js`
All screens are HTML elements positioned over the canvas. Screens: **Lobby** (name input + mode selection), **Room** (code display + player slots + start), **HUD** (top bar with player panels, turn indicator, ball dots, mute button; message area; power bar), **Result** (win/loss overlay with play-again). CSS is injected into `document.head` once on load.

### `network.js`
Wraps the shared `/ws` WebSocket. Manages room-code filtering, auto-reconnect, state sync interval, and typed message dispatch. The host generates the room code locally — the server never sees room state.

### `scoring.js`
Tracks turn state (first ball hit, balls pocketed this turn, rail contact after hit). Resolves fouls, assigns ball groups, handles eight-ball win/loss conditions, and switches turns. Integrates with the physics callbacks.

### `audio.js`
Sound effects via Web Audio API oscillators (no audio files required for SFX). Background music via HTML5 `<audio>`. Handles browser autoplay restrictions by deferring music start until the first user interaction. Exports `loadAudio`, `playSound`, `startMusic`, `stopMusic`, `toggleMute`, `isMuted`.
