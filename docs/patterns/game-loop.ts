/**
 * Pattern: Fixed-Timestep Game Loop
 *
 * Key principles:
 * - Fixed timestep for physics/logic (deterministic, reproducible)
 * - Variable rendering (render as fast as possible, interpolate between states)
 * - Frame budget tracking (detect when logic takes too long)
 * - Pause/resume without state corruption
 * - requestAnimationFrame for browser, custom loop for Node/native
 *
 * Agents: Spike-GameDev (architecture), L-Profiler (frame budget), Gimli (performance)
 *
 * Engine adaptations:
 *   Phaser: this.time.addEvent() for fixed timestep, scene.update() for variable
 *   Godot: _physics_process(delta) for fixed, _process(delta) for variable
 *   Unity: FixedUpdate() for fixed, Update() for variable
 *   Three.js: This file (manual loop with clock.getDelta())
 */

// --- Configuration ---
const FIXED_TIMESTEP = 1 / 60  // 60 Hz physics/logic
const MAX_FRAME_TIME = 0.25     // Cap to prevent spiral of death
const FRAME_BUDGET_MS = 16.67   // Target: 60 FPS

// --- Game State ---
interface GameState {
  paused: boolean
  time: number          // Total elapsed game time (paused time excluded)
  frameCount: number
  entities: Entity[]
}

interface Entity {
  x: number
  y: number
  prevX: number         // Previous position for interpolation
  prevY: number
  vx: number
  vy: number
  update(dt: number): void
}

// --- The Loop ---

let accumulator = 0
let lastTime = 0
let state: GameState = { paused: false, time: 0, frameCount: 0, entities: [] }

function gameLoop(currentTime: number): void {
  if (state.paused) {
    lastTime = currentTime   // Reset so unpause doesn't cause a time jump
    requestAnimationFrame(gameLoop)
    return
  }

  let frameTime = (currentTime - lastTime) / 1000  // Convert ms to seconds
  lastTime = currentTime

  // Cap frame time to prevent spiral of death (e.g., tab was backgrounded)
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME

  accumulator += frameTime

  // --- Fixed timestep: update logic/physics ---
  while (accumulator >= FIXED_TIMESTEP) {
    // Save previous positions for interpolation
    for (const entity of state.entities) {
      entity.prevX = entity.x
      entity.prevY = entity.y
    }

    // Update at fixed rate
    for (const entity of state.entities) {
      entity.update(FIXED_TIMESTEP)
    }

    state.time += FIXED_TIMESTEP
    accumulator -= FIXED_TIMESTEP
  }

  // --- Variable rendering: interpolate between states ---
  const alpha = accumulator / FIXED_TIMESTEP  // 0.0 to 1.0

  for (const entity of state.entities) {
    const renderX = entity.prevX + (entity.x - entity.prevX) * alpha
    const renderY = entity.prevY + (entity.y - entity.prevY) * alpha
    // render(entity, renderX, renderY)
  }

  // --- Frame budget tracking ---
  const frameEndTime = performance.now()
  const frameDuration = frameEndTime - currentTime
  if (frameDuration > FRAME_BUDGET_MS) {
    console.warn(`Frame ${state.frameCount} exceeded budget: ${frameDuration.toFixed(1)}ms`)
    // L-Profiler flags: investigate which entities/systems took too long
  }

  state.frameCount++
  requestAnimationFrame(gameLoop)
}

// --- Pause/Resume ---
function pause(): void { state.paused = true }
function resume(): void { state.paused = false }

// --- Start ---
function startGame(): void {
  lastTime = performance.now()
  requestAnimationFrame(gameLoop)
}

export { gameLoop, startGame, pause, resume, FIXED_TIMESTEP }
export type { GameState, Entity }
