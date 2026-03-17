/**
 * Pattern: Entity Component System (ECS)
 *
 * Key principles:
 * - Entities are IDs, not objects. No inheritance hierarchy.
 * - Components are pure data. No methods.
 * - Systems operate on components. All logic lives in systems.
 * - Composition over inheritance: an entity with Position + Velocity + Sprite is a moving sprite.
 * - Object pooling: reuse entity IDs and component storage instead of GC pressure.
 *
 * Agents: Spike-GameDev (architecture), L-Profiler (memory/GC), Gimli (performance)
 *
 * Engine adaptations:
 *   Phaser: Arcade Physics bodies are pseudo-ECS. For full ECS, use bitecs or miniplex.
 *   Godot: Scene tree is composition-based (nodes = components). Not pure ECS but same spirit.
 *   Unity: Unity DOTS/ECS for performance-critical systems, MonoBehaviour for the rest.
 *   Three.js: This file (manual ECS, or use bitecs/miniplex library)
 */

// --- Entity ---
type EntityId = number
let nextEntityId: EntityId = 0

function createEntity(): EntityId {
  return nextEntityId++
}

function destroyEntity(id: EntityId): void {
  // Remove all components for this entity
  for (const store of componentStores.values()) {
    store.delete(id)
  }
}

// --- Components (pure data, no methods) ---
interface Position { x: number; y: number }
interface Velocity { vx: number; vy: number }
interface Sprite { texture: string; width: number; height: number }
interface Health { current: number; max: number }
interface Collider { radius: number }
interface PlayerControlled { speed: number }
interface Enemy { aiType: 'chase' | 'patrol' | 'idle'; target?: EntityId }

// --- Component Storage ---
const componentStores = new Map<string, Map<EntityId, unknown>>()

function registerComponent<T>(name: string): {
  set: (id: EntityId, data: T) => void
  get: (id: EntityId) => T | undefined
  has: (id: EntityId) => boolean
  delete: (id: EntityId) => void
  all: () => [EntityId, T][]
} {
  const store = new Map<EntityId, T>()
  componentStores.set(name, store as Map<EntityId, unknown>)
  return {
    set: (id, data) => store.set(id, data),
    get: (id) => store.get(id),
    has: (id) => store.has(id),
    delete: (id) => store.delete(id),
    all: () => [...store.entries()],
  }
}

// Register component stores
const positions = registerComponent<Position>('position')
const velocities = registerComponent<Velocity>('velocity')
const sprites = registerComponent<Sprite>('sprite')
const healths = registerComponent<Health>('health')
const colliders = registerComponent<Collider>('collider')
const playerControlled = registerComponent<PlayerControlled>('playerControlled')
const enemies = registerComponent<Enemy>('enemy')

// --- Systems (all logic here, not in components) ---

function movementSystem(dt: number): void {
  for (const [id, vel] of velocities.all()) {
    const pos = positions.get(id)
    if (pos) {
      pos.x += vel.vx * dt
      pos.y += vel.vy * dt
    }
  }
}

function collisionSystem(): [EntityId, EntityId][] {
  const collisions: [EntityId, EntityId][] = []
  const entities = colliders.all()
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const [idA, colA] = entities[i]
      const [idB, colB] = entities[j]
      const posA = positions.get(idA)
      const posB = positions.get(idB)
      if (posA && posB) {
        const dx = posA.x - posB.x
        const dy = posA.y - posB.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < colA.radius + colB.radius) {
          collisions.push([idA, idB])
        }
      }
    }
  }
  return collisions
}

// --- Entity Factory (composition) ---

function createPlayer(x: number, y: number): EntityId {
  const id = createEntity()
  positions.set(id, { x, y })
  velocities.set(id, { vx: 0, vy: 0 })
  sprites.set(id, { texture: 'player.png', width: 32, height: 32 })
  healths.set(id, { current: 100, max: 100 })
  colliders.set(id, { radius: 16 })
  playerControlled.set(id, { speed: 200 })
  return id
}

function createEnemy(x: number, y: number, aiType: 'chase' | 'patrol'): EntityId {
  const id = createEntity()
  positions.set(id, { x, y })
  velocities.set(id, { vx: 0, vy: 0 })
  sprites.set(id, { texture: 'enemy.png', width: 32, height: 32 })
  healths.set(id, { current: 50, max: 50 })
  colliders.set(id, { radius: 16 })
  enemies.set(id, { aiType })
  return id
}

export {
  createEntity, destroyEntity, createPlayer, createEnemy,
  movementSystem, collisionSystem,
  positions, velocities, sprites, healths, colliders, playerControlled, enemies
}
export type { EntityId, Position, Velocity, Sprite, Health }
