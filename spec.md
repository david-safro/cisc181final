# Agent Instructions: Multiplayer Pool Game
## Built on the Existing GameGarage Framework

---

## BEFORE YOU WRITE ANYTHING — READ THIS FIRST

You are adding a pool game to an existing project called **GameGarage**. The project already has a running FastAPI server (`main.py`), a WebSocket broadcast system, a phone controller UI, and a Kontra.js menu. You must not modify any of these existing files. You are only adding new files.

Study the existing system carefully before writing a single line:

- `main.py` — FastAPI server. It mounts a `/games` directory and serves each subfolder as a game. It has one WebSocket at `/ws` that receives messages and broadcasts them verbatim to every connected client. There is no room logic, no player tracking — it is a pure relay.
- `templates/menu.html` — The game menu. It reads all folders inside `/games`, displays them, and when a player selects one, it calls `import('./games/{name}/{name}.js')` and expects the module to export a default function. That function receives `{ canvas, context, name, kontra }` and must return a Kontra `Scene` object with an `id` property matching the game name.
- `static/controller.js` — A singleton `Controller` class that connects to `/ws` and surfaces incoming joystick messages via `getInputState()`. You will not use this for pool (pool uses mouse input), but be aware it exists and shares the same WebSocket connection.

Your game must live entirely inside a new folder: `/games/pool/`. Every file you create goes there. The main entry point is `/games/pool/pool.js`, which must export a default function matching the signature the menu expects.

---

## UNDERSTANDING THE WEBSOCKET ARCHITECTURE

The existing WebSocket is a **broadcast relay** — it sends every message to every connected client. There are no rooms, no filters, and no player identity on the server. This means:

- If two separate pairs of players are playing pool simultaneously, their messages will reach each other's clients.
- You must implement **room filtering entirely on the client side**. Every message your game sends over the WebSocket must include a `roomCode` field. Every message handler in your game must silently discard messages whose `roomCode` does not match the local player's current room.
- This is sufficient for a classroom/demo context. Do not attempt to modify `main.py` to add server-side rooms.

---

## FILE STRUCTURE TO CREATE

Inside `/games/pool/`, create the following files. Each is described in detail in its own section below.

```
/games/pool/
  pool.js          ← Entry point, exports default function, returns Kontra Scene
  physics.js       ← Self-contained physics engine module
  renderer.js      ← Pseudo-3D projection and all drawing logic
  ui.js            ← All screens: lobby, room, HUD, result
  network.js       ← WebSocket wrapper with room-code filtering
  scoring.js       ← Turn logic, foul detection, win conditions
  audio.js         ← Sound effects and background music
  constants.js     ← Every number used anywhere in the game
  poolscreenshot.png ← A static screenshot image (required by the menu system)
```

The menu system will automatically discover the pool game because it lists all subfolders of `/games`. It will look for `/games/pool/poolscreenshot.png` as the thumbnail. Create or supply a simple PNG for this.

---

## SECTION 1 — CONSTANTS (`constants.js`)

This file is a plain ES module that exports named constants. Nothing in this file is a function or class — only data.

Define constants for the following categories. Use descriptive names grouped by concern.

**Table geometry:** The logical 2D playing surface should be 900 units wide and 450 units tall. Rail thickness (the unusable border inside the table boundary) should be 36 units. Define color strings for felt and rail.

**Ball properties:** All balls have the same radius (12 units) and mass (1.0). Define separate constants for restitution (energy retained on collision, approximately 0.97), rolling friction (a per-frame velocity multiplier slightly below 1.0, around 0.9885), spin decay (how fast angular velocity fades each frame), spin grip rate (how fast spin transfers into linear velocity), and a sleep speed threshold (the squared speed below which a ball is considered stationary).

**Physics engine settings:** Fixed timestep should be 1/120 of a second. Define a maximum number of physics steps per frame (8) to prevent spiral-of-death. Define constants for CCD enablement, spatial cell size (must be at least the ball diameter), a positional correction factor (Baumgarte, between 0.2 and 0.8), and a penetration slop tolerance.

**Pocket positions:** Define an array of six pocket objects, each with x and y coordinates in the logical 2D space. Three across the top (corners and center) and three across the bottom. Define a pocket mouth radius (around 16 units).

**Projection settings:** The pseudo-3D effect uses a 30-degree angle (Math.PI / 6), a vertical scale factor for compression (around 0.55), screen offsets to center the projected table, shadow offsets for ball shadows, and a rail extrusion height (how many screen pixels the 3D rail face is tall).

**Cue settings:** Define cue length, base width, tip width, color, minimum and maximum power, and a rate at which drag distance converts to power.

**Ball groups:** Define which ball indices (0–15) belong to solids (1–7), stripes (9–15), the cue ball (0), and the eight ball (8). Define the standard rack position and the break position for the cue ball.

**Network:** Define the WebSocket URL (`ws://` + `location.host` + `/ws` to match the existing server), a reconnect delay, a state sync interval (500ms), and a ping interval.

**Ball colors:** Define an array of 16 color strings indexed 0–15. Index 0 is white (cue ball). Indices 1–7 are solid colors. Index 8 is black. Indices 9–15 repeat the same colors as 1–7 (for stripes, the white band is drawn procedurally, not via a different base color).

---

## SECTION 2 — PHYSICS ENGINE (`physics.js`)

This module manages all ball state and simulation. It exports functions — no classes. It imports only from `constants.js`.

### Internal state layout

Store all ball state in flat typed arrays, not an array of objects. Create the following Float32Arrays and Uint8Arrays, each of length 16 (maximum number of balls):

- `posX`, `posY` — ball positions in logical 2D space
- `velX`, `velY` — ball velocities (units per fixed timestep, normalized to 60fps)
- `spinX`, `spinY` — angular velocity components affecting linear trajectory
- `active` — Uint8Array; 1 means the ball is on the table, 0 means pocketed
- `sleeping` — Uint8Array; 1 means the ball is stationary and skipped in simulation

Also maintain a floating-point accumulator variable for the fixed timestep.

Store three callback function references: one called when a ball is pocketed (receives the ball index), one called when two balls collide (receives both indices and the impulse magnitude), and one called when a ball hits a rail (receives the ball index).

### Exported functions

**`initPhysics(onPocketed, onCollision, onRailHit)`** — stores the three callbacks. Zeroes out all arrays.

**`placeBall(index, x, y)`** — sets position for a ball, zeros velocity and spin, marks it active and sleeping.

**`setupRack()`** — places all 16 balls in their starting positions. The 15 object balls form a triangle at the rack position defined in constants. Use a standard 8-ball rack arrangement: the eight ball in the center of the third row, one solid and one stripe in the back corners, and the rest arranged such that adjacent balls in the same row are not the same group. Place the cue ball at the break position. After placing all balls, mark them all sleeping.

**`applyShot(power, angle, tipOffsetX, tipOffsetY)`** — validates that the cue ball (index 0) is active and all balls are sleeping, then sets the cue ball's velocity components based on the angle and power. Tip offset values create spin: a horizontal offset (tipOffsetX) creates side spin affecting Y trajectory, and a vertical offset (tipOffsetY) creates top/back spin affecting X trajectory. Multiply tip offsets by power and a small spin factor (around 0.18) to get the spin component. Wake the cue ball by setting its sleeping flag to 0. Returns false if the shot is invalid, true otherwise.

**`allSleeping()`** — returns true only if every active ball has its sleeping flag set to 1.

**`updatePhysics(frameDeltaSeconds)`** — this is called once per frame from the game loop. It adds the frame delta to the accumulator, then runs fixed physics steps (calling the internal `step` function) consuming `FIXED_DT` per step, until either the accumulator is drained or `MAX_STEPS_PER_FRAME` steps have run.

**`getSnapshot()`** — returns a plain object containing copies of all typed arrays as regular JS arrays. This is used for network state sync.

**`applySnapshot(snapshot)`** — writes all values from a snapshot object back into the typed arrays. Only call this when all balls are sleeping to avoid visible position jumps.

**`getActiveBalls()`** — returns an array of objects `{ index, x, y }` for all balls where `active[i]` is 1.

**`getBallState(index)`** — returns `{ x, y, vx, vy, active }` for a specific ball index.

### Internal subsystems (not exported)

**Spatial hash (broad phase):** Use a JavaScript Map where keys are integer-encoded cell coordinates. To insert a ball, find which grid cells its bounding circle overlaps (it can span up to four cells), and add the ball's index to each cell's list. After building the hash, iterate all cells and emit candidate collision pairs (pairs of ball indices that share at least one cell). Use a Set of string keys to deduplicate pairs. Only insert balls that are active and not sleeping.

**Narrow phase collision resolution:** For each candidate pair, compute the distance between centers. If it is less than two radii, a collision occurred. Compute the collision normal (unit vector from center to center). Project the relative velocity onto the normal. If the projection is positive (balls separating), skip. Otherwise compute an impulse scalar equal to the relative velocity projection multiplied by restitution, and apply it symmetrically to both balls' velocities. Also apply positional correction: if the penetration depth exceeds the slop tolerance, push both balls apart along the normal by half the corrected penetration each. Wake any sleeping ball involved in a collision. Fire the collision callback with both indices and the impulse magnitude.

**Continuous Collision Detection (CCD):** Before the broad-phase step, scan all pairs of active non-sleeping balls and compute the earliest time `t` (between 0 and 1, as a fraction of the current fixed timestep) at which their swept circles would first touch. The math is a quadratic solve on relative motion. If a collision is found at time `t`, advance all balls to that time, resolve the collision, then continue the remaining `1 - t` fraction of the step. This prevents fast balls from tunneling through each other during a hard break shot.

**Rail resolution:** After each integration step, clamp every active non-sleeping ball's position to the playable area (table bounds minus rail thickness minus ball radius). If a ball was clamped on the X axis, negate its X velocity and multiply by restitution. Same for Y. Fire the rail hit callback if any clamping occurred.

**Pocket detection:** After rail resolution, check every active non-sleeping ball against every pocket position. Compute squared distance to the pocket center. If it is less than the pocket radius squared, mark the ball as inactive and sleeping, zero its velocity and spin, and fire the pocketed callback with the ball's index.

**Single ball integration:** For one active, non-sleeping ball: apply spin grip (lerp velocity toward spin values by a small factor), decay spin, apply rolling friction (multiply velocity by the friction constant), then move position by velocity. After moving, check if squared speed is below the sleep threshold and if so zero velocity, zero spin, and set sleeping to 1.

**Step function:** Run integration for all balls, then CCD+collision, then rail resolution, then pocket detection — in that order.

---

## SECTION 3 — RENDERER (`renderer.js`)

This module handles all drawing. It imports from `constants.js` and `physics.js`. It exports functions only — no state.

### Projection

Write a `project(x, y)` function that transforms a 2D logical coordinate into a screen coordinate using the perspective projection defined in constants. The formula compresses the Y axis and shifts X based on a cosine factor, creating the appearance of a tilted table. Also write a `getCanvasSize()` function that projects all four table corners and returns the bounding screen dimensions needed.

### Table drawing

The table drawing function takes a canvas 2D context. Draw in this order:

First, draw the far rail (top edge) and right rail as 3D extruded trapezoids — each rail is a four-point polygon formed by projecting the top edge of the rail and then offsetting the bottom two points downward by the rail extrusion height in screen pixels. Fill with the rail color and add a dark stroke.

Second, draw the felt surface as a filled projected quadrilateral covering the entire table interior.

Third, draw the near rail (bottom edge) and left rail as 3D trapezoids on top of the felt, using the same technique. These appear in front because they are drawn after the felt.

Fourth, draw pocket holes at each pocket position. Project each pocket center and draw a filled ellipse (not a circle — the Y axis must be compressed by the same scale factor used in projection). Fill black with a thin gold/yellow rim stroke.

Finally, draw a faint dashed center line between the midpoints of the top and bottom edges (projected) to indicate the break zone. Use very low opacity.

### Ball drawing

The ball drawing function takes the context, ball index, x position, y position, whether it is a stripe, and the base color string.

Draw in this order for each ball:

Shadow — project the position, then draw an ellipse offset slightly right and down from the projected center. Use semi-transparent black fill. The ellipse should be slightly smaller than the ball's screen-projected dimensions.

Base fill — draw the ball as a projected ellipse (compressed on Y axis) filled with the ball's base color.

Stripe band — if the ball is a stripe (index 9–15), clip to the ball ellipse and draw a white horizontal rectangle across the middle third of the ball. Then draw a smaller colored ellipse in the center of the white band to show the ball's color through the stripe.

Number label — for all balls except the cue ball (index 0), draw the ball number as centered text inside the ellipse. Use white text for dark-colored balls, black text for light-colored balls. The eight ball always uses white text.

Specular highlight — draw a radial gradient from the upper-left quadrant of the ball outward. The gradient goes from semi-transparent white at the center to fully transparent at the ball edge. This makes the ball look spherical.

Outline — draw the ball ellipse outline in very slightly dark stroke.

### Cue stick drawing

The cue drawing function takes context, cue ball position (in logical 2D), aim angle, current power value, and a boolean for whether the player is actively dragging.

The cue tip points toward the cue ball. Calculate the tip screen position as the projected cue ball center minus a short offset along the aim direction (so the tip just touches the ball). The base of the cue extends backward from the tip along the aim direction by the cue length plus a pullback distance (proportional to power). Draw the shadow of the cue first — same path, offset a few pixels down-right, thick dark semi-transparent stroke.

Draw the cue body as a line from tip to base with a linear gradient stroke going from pale wood at the tip to dark wood at the base.

If the player is dragging (actively setting power), draw a power indicator arc around the cue ball. The arc spans a short angular range centered on the aim direction. Its color changes with power from green (low) to red (max) using HSL color interpolation.

Always draw a ghost ball (faint circle) at a fixed distance ahead of the cue ball along the aim direction, and a dashed line from the cue ball to the ghost ball. This is the aim guide.

### Frame rendering

The main `renderFrame(ctx, cueState)` function clears the canvas, draws the table, then draws all active balls sorted by their Y position (painter's algorithm — balls further away are drawn first so near balls appear in front). After all balls, draw the cue if `cueState.visible` is true.

---

## SECTION 4 — UI (`ui.js`)

This module manages all HTML screens layered over the canvas. All screens are HTML div elements positioned absolutely over the canvas container. Only one screen is visible at a time. This module imports only from `constants.js`.

### Screen management

Maintain a reference to an overlay div and a map of screen names to their DOM elements. The `showScreen(name, data)` function hides all screens, shows the requested one, and re-renders its content using the appropriate render function below. Pass `data` to the render function for dynamic content.

### Lobby screen

The lobby is the first screen shown. It contains:
- A large styled game title ("POOL" or similar)
- A text input for the player's name (max 16 characters)
- A "Create Room" button
- A horizontal divider
- A short text input for a room code plus a "Join Room" button

When the Create Room button is clicked, read the player name input and invoke an `onCreateRoom(name)` callback. When Join is clicked, read both inputs and invoke `onJoinRoom(name, code)`. Validate that the room code input has at least 4 characters before allowing join. The room code input should automatically uppercase its value.

### Room waiting screen

Shown after creating or joining a room. It contains:
- A large room code display with a "Copy" button that writes the code to the clipboard
- Two player slots — the first always shows the local player as filled, the second shows "Waiting..." if no opponent has joined yet, or the opponent's name once they join
- If the local player is the host AND an opponent has joined, show a "Start Game" button
- If the local player is not the host, show a "Waiting for host..." message instead of the start button
- A "Leave Room" button at the bottom

The screen must be re-renderable (calling `showScreen('room', updatedData)` again should reflect new opponent state without flickering). Expose click callbacks for Start and Leave via return values from the render function.

### In-game HUD

The HUD is always visible during gameplay but uses `pointer-events: none` so it doesn't block mouse input on the canvas. It consists of:

**Top bar** — spans the full width at the top of the overlay. Contains two player panels (left for player 1, right for player 2) with a turn indicator in the center. Each player panel shows the player's name and a row of small colored circles representing their ball group. Circles for pocketed balls are dimmed (low opacity). The panel for the current turn's player is highlighted (glowing border or lighter background). The center shows "YOUR TURN" in bright green when it is the local player's turn, or "OPPONENT'S TURN" in muted gray otherwise.

**Message area** — a floating pill below the top bar, centered horizontally. Shows temporary game messages like "Solids assigned!", "Foul — scratch!", "Keep going!". The message should fade out after 3 seconds. Implement this with a CSS opacity transition.

**Power bar** — positioned at the bottom center. Appears only when the local player is actively dragging to set shot power. It is a horizontal progress bar that fills from left to right, changing color from green to red as power increases. Hide it at all other times.

### Result screen

An overlay (semi-transparent dark background) that appears centered over the canvas when the game ends. Contains:
- A large emoji icon (trophy for win, warning for foul, sad face for loss)
- A title ("You Win!", "Opponent Wins!", etc.)
- A descriptive message explaining why the game ended
- A "Play Again" button that resets and goes back to the room waiting screen
- A "Main Menu" button that disconnects and returns to the lobby

### CSS

All styles are written in a `<style>` block inside `pool.js`'s HTML injection or in an injected `<style>` element added to `document.head` when the module loads. The theme is dark green felt — dark background (`#0a0f0a`), green accent colors (`#1a6b3c`), gold accent for titles (`#d4a85a`), muted gray for secondary text. Buttons use rounded corners, smooth hover transitions, and distinct visual states for primary and secondary actions. All panels use semi-transparent dark backgrounds with subtle green border accents.

---

## SECTION 5 — NETWORK (`network.js`)

This module wraps the existing WebSocket. It imports constants for the WS URL and timing values.

### Connection

On `connect(onOpen, onClose)`, create a new WebSocket connecting to `ws://${location.host}/ws` (matching the existing server). On open, call `onOpen`. On close, schedule a reconnect after `RECONNECT_DELAY_MS` and call `onClose`. On message, parse the JSON, check that `msg.roomCode` matches the locally stored room code (if one is set), and if so dispatch to the registered handler for `msg.type`. Messages without a matching room code are silently ignored.

### API

**`send(msg)`** — JSON-stringifies and sends the message. Automatically adds the current room code to every outgoing message. Only sends if the socket is open.

**`on(type, handler)`** — registers a message handler for a given type string.

**`setRoomCode(code)`** — stores the room code that this client filters on.

**`createRoom(playerName)`** — sends a `create_room` message. Since the server has no room logic, the client generates the room code itself using a random 6-character alphanumeric string and sends it along with the player name. Both players will know the code — the host generates it, the joiner enters it.

**`joinRoom(roomCode, playerName)`** — stores the room code locally and sends a `join_room` message with the code and player name. Other clients with that room code will receive the message.

**`sendShot(angle, power, tipOffsetX, tipOffsetY)`** — sends a `shot` message with all four values.

**`startStateSync(getSnapshotFn)`** — sets up an interval that calls `getSnapshotFn()` and sends a `state_sync` message every 500ms. Call this when gameplay starts.

**`stopStateSync()`** — clears the sync interval.

**`disconnect()`** — closes the WebSocket and clears the room code.

### Important note on room code generation

Because the server is a pure relay with no room registry, the "host creates a room" flow works like this: the host generates a random 6-character code locally, displays it, and starts listening for join messages with that code. When a joiner enters the same code and sends a `join_room` message, the host receives it (because they share the room code filter) and can respond. There is no server-side acknowledgment — the host simply responds with a `room_confirm` message and the game proceeds. This is peer-to-peer coordination over a broadcast relay.

---

## SECTION 6 — SCORING (`scoring.js`)

This module contains all game rule logic. It imports from `constants.js`.

### Game state structure

Maintain a single mutable game state object (not a class) with the following fields: `phase` (one of `'lobby'`, `'room'`, `'playing'`, `'ended'`), `myPlayerNum` (1 or 2), `currentTurn` (1 or 2), `breakTaken` (boolean), two player objects each containing name, assigned group (null until assigned, then `'solids'` or `'stripes'`), and an array of pocketed ball indices.

Also maintain a turn state object that resets at the start of every shot: `firstBallHit` (the index of the first object ball the cue ball contacted, or null), `ballsPocketedThisTurn` (array of indices), `railContactAfterHit` (boolean — set to true when the cue ball or any ball contacts a rail after the cue ball has already struck an object ball), `foulOccurred` (boolean), `foulReason` (string or null).

### Turn resolution

`resolveTurn()` is called once all balls come to rest after a shot. It checks fouls first, then records pocketed balls, assigns groups if not yet assigned, and determines the next turn.

**Foul checks (in this order):**

1. Cue ball pocketed (scratch) — if index 0 is in `ballsPocketedThisTurn`, it's a foul.
2. No ball contacted — if `firstBallHit` is null, it's a foul.
3. Wrong group hit first — if groups are assigned and the first ball hit belongs to the opponent's group (and is not the eight ball), it's a foul.
4. Eight ball hit too early — if the shooter still has balls remaining and hits the eight ball first, it's a foul.
5. No rail contact — if no ball was pocketed and `railContactAfterHit` is false, it's a foul.

A foul ends the shooter's turn, switches to the opponent, and grants them ball-in-hand (they can place the cue ball anywhere). Show a foul message.

**Group assignment:** If groups are not yet assigned and at least one non-eight, non-cue ball was pocketed this turn legally, assign the shooter's group based on the first ball pocketed (indices 1–7 = solids, 9–15 = stripes). Assign the opposite group to the opponent. Display both assignments.

**Eight ball logic:** If the eight ball (index 8) is pocketed this turn, check two conditions: (a) did the shooter already pocket all seven balls in their group? (b) did they also scratch? If the shooter's group is not yet cleared, they lose. If they scratched while pocketing the eight ball, they lose. Otherwise, they win.

**Turn continuation:** If the shooter pocketed at least one ball from their own group (and did not foul), they continue their turn. Otherwise, the turn switches to the opponent.

**`switchTurn(ballInHand)`** — sets `currentTurn` to the other player, resets `turnState`, and either grants normal aiming or ball-in-hand mode.

**`endGame(winnerName, reason)`** — sets phase to `'ended'`, shows the result screen with appropriate win/loss state, and sends a `game_over` message over the network.

### Collision callbacks for scoring

Register with the physics engine. When the cue ball (index 0) collides with another ball and `firstBallHit` is null, record that ball index as `firstBallHit`. When any ball hits a rail and `firstBallHit` is not null, set `railContactAfterHit` to true. When a ball is pocketed, add it to `ballsPocketedThisTurn`.

---

## SECTION 7 — INPUT (`pool.js`, input section)

Handle mouse and touch input for aiming and shooting. All input is disabled unless the local player's turn is active and all balls are sleeping.

### Cue state

Maintain a local `cueState` object with fields: `visible` (boolean), `x` and `y` (cue ball position in logical 2D, copied from physics), `angle` (aim direction in radians), `power` (current power value), and `dragging` (boolean).

### Mouse/touch flow

On mouse move: if it's not the local player's turn or balls are moving, return. Project the cue ball's current physics position to screen space. Compute the angle from the screen-space mouse position to the projected cue ball center using `Math.atan2`. Add `Math.PI` to reverse direction (cue is pulled back, not pushed forward). Update `cueState.angle`. If currently dragging, compute drag distance from the drag start position, multiply by the power rate constant, clamp to max power, and update `cueState.power`. Show the power bar.

On mouse down: record drag start position, set `mouseDown` to true, reset power to zero.

On mouse up: if dragging and power exceeds minimum, fire the shot. Call `applyShot` from the physics engine, send the shot over the network, hide the power bar, set `cueState.visible` to false, and reset `turnState`. If power is below minimum (a tap with no drag), do nothing.

Mirror all mouse events with touch events (use `touches[0]` for position). Add `{ passive: false }` and call `preventDefault()` on touch events to prevent scrolling.

---

## SECTION 8 — AUDIO (`audio.js`)

This module loads and plays sound effects and background music.

Use the HTML5 `Audio` constructor to load sound files. Store each in a named map. Sounds needed: cue hit (played when a shot fires), ball collision (played on ball-to-ball contact, volume scaled by impulse magnitude), pocket (played when a ball drops), rail hit (played on wall contact, low volume), and background music (looping, low volume, around 25%).

For short sound effects, clone the Audio node before playing to allow overlapping sounds (`audio.cloneNode()`). Wrap all `.play()` calls in try-catch to silently handle autoplay restrictions.

Export `loadAudio()`, `playSound(name, volume)`, `startMusic()`, `stopMusic()`, and `toggleMute()`.

---

## SECTION 9 — MAIN ENTRY POINT (`pool.js`)

This is the file the menu imports. It must export a default function with the signature `({ canvas, context, name, kontra }) => Scene`.

### What the default function must do

1. Inject the CSS into `document.head` as a `<style>` element (do this only once, checking if it's already been added).
2. Create the HTML overlay structure over the canvas. Check if `#pool-ui-overlay` already exists before creating it (the menu may call this function more than once if the player navigates back).
3. Initialize audio by calling `loadAudio()`.
4. Initialize physics by calling `initPhysics` with the three callbacks (pocketed, collision, rail hit). The callbacks update turn state and trigger audio.
5. Connect to the WebSocket via `network.connect(...)`.
6. Register all network message handlers (see Section 10).
7. Show the lobby screen.
8. Create a Kontra `Scene` object with `id` set to the `name` parameter. Override its `update(dt)` method to call `updatePhysics(dt)` and detect the transition from all-balls-moving to all-balls-sleeping (call `resolveTurn()` at that moment). Override its `render()` method to call `renderFrame(context, cueState)` and update the HUD DOM.
9. Return the scene.

### Game loop integration note

The menu's existing `GameLoop` calls `sceneManager.update()` and `sceneManager.render()` every frame. Your scene's `update` and `render` methods are called as part of this. Do not create a new `GameLoop` — plug into the existing one via the scene.

---

## SECTION 10 — NETWORK MESSAGE HANDLERS

Register these handlers via `network.on(type, handler)` during initialization.

**`join_room` received:** Another player joined this client's room. Update the room screen to show the opponent's name. Store the opponent's name in game state.

**`room_confirm` received:** The host confirmed the join. The joiner updates their room screen and waits for the game start signal.

**`start_game` received:** Initialize game state (player names, turn 1 for host). Call `setupRack()` from the physics engine. Show the HUD screen. Start state sync. Note the current turn (player 1 is always the host).

**`opponent_shot` received:** The opponent took a shot. Call `applyShot` locally with the received angle, power, and tip offsets to simulate the same shot on this client. Reset turn state.

**`state_sync` received:** Received a periodic physics snapshot from the other client. If all balls are currently sleeping, call `applySnapshot` to correct any drift. If balls are in motion, queue the snapshot and apply it when they stop.

**`game_over` received:** The other client declared a winner (the game ended on their side). Show the result screen with the appropriate win/loss state for the local player.

**`opponent_left` received:** The opponent disconnected. Show the result screen declaring the local player the winner by default.

**`error` received:** Show a brief toast notification with the error message.

### Host-side join flow

When the local client is the host and receives a `join_room` message with the matching room code, respond by sending a `room_confirm` message back (it will be broadcast to all, but the joiner will see it via room code filtering). Store the opponent's name. Update the room screen to show the Start Game button.

---

## SECTION 11 — GAME FLOW STATE MACHINE

The game progresses through these states. Each transition has defined behavior.

**Lobby → Room (Create):** Player fills in name, clicks Create. The client generates a 6-character room code. `network.setRoomCode(code)` is called. A `create_room` message is sent. The room waiting screen is shown with the local player as Player 1 (host).

**Lobby → Room (Join):** Player fills in name and code, clicks Join. `network.setRoomCode(code)` is called. A `join_room` message is sent. The room waiting screen is shown with the local player as Player 2.

**Room (waiting for opponent):** Host waits. On receiving `join_room` for their room code, the host sends `room_confirm` and updates the room screen to show the Start button.

**Room (both players) → Playing:** Host clicks Start. A `start_game` message is broadcast. Both clients initialize physics, show the HUD, and start the game loop. Player 1 (host) goes first.

**Playing → Playing (turn loop):** Each turn: local player aims and shoots if it's their turn, shot is sent over network, opponent simulates the same shot, both wait for balls to stop, scoring resolves, next turn begins.

**Playing → Ended:** A win or loss condition is detected on one client, `endGame` is called, `game_over` is broadcast, both clients show the result screen.

**Ended → Room (Play Again):** Both result screens show "Play Again." If either player clicks it, broadcast a `play_again` message. Both clients reset game state, call `setupRack()`, and return to playing with roles preserved.

**Ended / Room → Lobby:** "Main Menu" disconnects the WebSocket, clears all game state, removes the UI overlay, and shows the lobby screen.

---

## SECTION 12 — BALL-IN-HAND PLACEMENT

When a foul is called, the opponent receives ball-in-hand. During ball-in-hand mode, the cue ball is not subject to normal aiming — instead, clicking anywhere on the table places the cue ball there.

During ball-in-hand, convert the click position from screen space back to logical 2D space (the inverse of the `project()` function). Clamp the result to the playable area (inside the rails, not overlapping any other ball or pocket). Call `placeBall(0, x, y)` to place the cue ball. After placement, switch to normal aiming mode.

Write a `reverseProject(screenX, screenY)` function in `renderer.js` that inverts the projection math to get logical coordinates from a screen click.

---

## SECTION 13 — IMPLEMENTATION CHECKLIST

Work through this list in order. Do not mark an item complete until it is verified working.

**Setup**
- [ ] `/games/pool/` folder created
- [ ] `poolscreenshot.png` placed in the folder (any placeholder image)
- [ ] Pool game appears in the GameGarage menu at `localhost:8081`
- [ ] Selecting pool from the menu loads without console errors
- [ ] The default export signature matches what the menu expects

**Constants**
- [ ] All table, ball, pocket, physics, projection, cue, network, and color constants defined
- [ ] No magic numbers appear anywhere outside `constants.js`

**Physics**
- [ ] `setupRack()` places 15 balls in correct triangle formation with 8-ball in center
- [ ] `applyShot()` correctly sets velocity from angle and power
- [ ] `integrateOne()` applies friction and moves position
- [ ] `resolveRails()` bounces from all four sides with restitution
- [ ] `resolveCollision()` handles overlap correctly without sinking
- [ ] Spatial hash correctly identifies candidate pairs
- [ ] CCD prevents tunneling on a maximum-power break shot
- [ ] `checkPockets()` removes balls and fires callback
- [ ] `allSleeping()` returns true correctly and only when appropriate
- [ ] `getSnapshot()` and `applySnapshot()` round-trip correctly
- [ ] Fixed timestep accumulator runs correctly without spiral of death

**Renderer**
- [ ] `project()` maps table corners correctly — table appears tilted in perspective
- [ ] Far and right rails appear as 3D extruded shapes
- [ ] Felt surface fills the interior of the projected table
- [ ] Near and left rails appear in front of the felt
- [ ] Pocket holes appear at correct positions
- [ ] Ball shadows appear offset below each ball
- [ ] Ball base colors correct for each index
- [ ] Stripe balls show white band with color center
- [ ] Ball numbers legible on all colored balls
- [ ] Specular highlight makes balls look spherical
- [ ] Balls sorted by Y before drawing (near balls appear in front)
- [ ] Cue extends behind the cue ball along the aim direction
- [ ] Cue pullback increases visually with power
- [ ] Ghost ball and aim line visible when aiming
- [ ] Power arc changes color from green to red

**UI**
- [ ] Lobby screen renders correctly with all inputs and buttons
- [ ] Room screen shows room code prominently with copy button
- [ ] Player slots update when opponent joins
- [ ] Start button appears for host only when both players present
- [ ] HUD top bar shows both player panels
- [ ] Ball indicators show correct colors and dim when pocketed
- [ ] Active turn player panel is highlighted
- [ ] Turn indicator text changes for local player vs opponent
- [ ] Game messages appear and fade after 3 seconds
- [ ] Power bar appears on drag and hides after shot
- [ ] Result screen shows correct title, message, and buttons
- [ ] CSS applied: dark theme, green felt accents, gold title

**Network**
- [ ] WebSocket connects on module load
- [ ] Reconnect triggers on disconnect
- [ ] All outgoing messages include room code
- [ ] Incoming messages without matching room code are discarded
- [ ] Host generates room code and displays it
- [ ] Joiner sends `join_room`, host receives and responds with `room_confirm`
- [ ] `start_game` broadcast causes both clients to initialize and start playing
- [ ] `opponent_shot` causes local physics to simulate the shot
- [ ] State sync sends snapshot every 500ms during play
- [ ] Received snapshot applied when all balls sleeping
- [ ] `game_over` causes both clients to show correct win/loss result
- [ ] `opponent_left` causes winner display

**Scoring**
- [ ] `turnState` resets at start of each shot
- [ ] `firstBallHit` records on first cue ball collision
- [ ] `railContactAfterHit` sets correctly
- [ ] Groups assigned on first legal pocket after break
- [ ] Pocketed balls recorded to correct player
- [ ] Turn continues on own-group pocket
- [ ] Turn switches on miss
- [ ] Foul: scratch (cue ball pocketed)
- [ ] Foul: no ball hit
- [ ] Foul: wrong group hit first
- [ ] Foul: no rail contact after hit
- [ ] Ball-in-hand granted on foul
- [ ] Eight ball early pocket = loss
- [ ] Eight ball + scratch = loss
- [ ] Legal eight ball pocket after clearing group = win
- [ ] Result screen shown with correct winner

**Input**
- [ ] Cue angle updates on mouse move when it's local player's turn
- [ ] Drag distance increases power proportionally
- [ ] Shot fires on mouse up when power > minimum
- [ ] Shot disabled when not local player's turn
- [ ] Shot disabled while balls are moving
- [ ] Touch events work equivalently to mouse events
- [ ] Ball-in-hand click places cue ball at clicked position
- [ ] Ball-in-hand clamps to playable area and avoids overlaps

**Audio**
- [ ] Cue hit sound plays on shot fire
- [ ] Ball collision sound plays on contact, louder for harder hits
- [ ] Pocket sound plays on ball drop
- [ ] Rail hit sound plays on wall contact
- [ ] Background music loops during gameplay
- [ ] Mute toggle works correctly

---

## CRITICAL NOTES FOR THE AGENT

Do not modify `main.py`, `menu.html`, `controller.js`, or `controller.html`. These are shared infrastructure for all GameGarage games.

The pool game must integrate as a Kontra Scene via the existing `SceneManager`. It must not create its own `GameLoop`.

The WebSocket is a broadcast relay with no server-side room concept. Room isolation is entirely client-side via room code filtering. This is intentional for this codebase.

The `project()` function is the single source of truth for all coordinate translation. Every piece of drawing code calls this function — nothing hardcodes screen coordinates.

Physics runs at a fixed 120Hz internal tick inside a variable framerate game loop. The accumulator pattern is mandatory — do not run physics at the render framerate.

Determinism between clients is achieved by both clients running the same physics code with the same initial conditions and the same shot inputs. The periodic state sync at 500ms is a drift correction safety net, not the primary sync mechanism.