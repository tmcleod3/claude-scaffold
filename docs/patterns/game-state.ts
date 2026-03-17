/**
 * Pattern: Hierarchical Game State Machine
 *
 * Key principles:
 * - Every game has states: Menu → Playing → Paused → GameOver (minimum)
 * - Transitions have enter/exit hooks (load assets on enter, clean up on exit)
 * - States can have sub-states (Playing → Cutscene, Playing → Dialog)
 * - History: can return to previous state (Pause → resume to Playing, not Menu)
 * - Serializable: save/load works by serializing the state stack
 *
 * Agents: Spike-GameDev (architecture), Éowyn-GameFeel (transitions), Constantine (state bugs)
 *
 * Engine adaptations:
 *   Phaser: this.scene.start('GameOver'), this.scene.pause('Playing')
 *   Godot: SceneTree.change_scene(), custom state machine node
 *   Unity: SceneManager.LoadScene(), or custom FSM MonoBehaviour
 */

// --- State Definition ---
interface GameStateConfig {
  name: string
  enter?: () => void | Promise<void>     // Called when entering this state
  exit?: () => void | Promise<void>      // Called when leaving this state
  update?: (dt: number) => void          // Called every frame while active
  handleInput?: (input: GameInput) => void
}

interface GameInput {
  type: 'keydown' | 'keyup' | 'click' | 'gamepad'
  key?: string
  button?: number
  x?: number
  y?: number
}

// --- State Machine ---
class StateMachine {
  private states: Map<string, GameStateConfig> = new Map()
  private stack: string[] = []             // State stack for history
  private current: GameStateConfig | null = null

  register(config: GameStateConfig): void {
    this.states.set(config.name, config)
  }

  get currentState(): string | null {
    return this.current?.name ?? null
  }

  async transition(stateName: string): Promise<void> {
    const next = this.states.get(stateName)
    if (!next) throw new Error(`Unknown state: ${stateName}`)

    // Exit current state
    if (this.current?.exit) await this.current.exit()

    // Push to history
    if (this.current) this.stack.push(this.current.name)

    // Enter new state
    this.current = next
    if (this.current.enter) await this.current.enter()
  }

  async back(): Promise<void> {
    if (this.stack.length === 0) return

    const previousName = this.stack.pop()!
    const previous = this.states.get(previousName)
    if (!previous) return

    if (this.current?.exit) await this.current.exit()
    this.current = previous
    if (this.current.enter) await this.current.enter()
  }

  update(dt: number): void {
    if (this.current?.update) this.current.update(dt)
  }

  handleInput(input: GameInput): void {
    if (this.current?.handleInput) this.current.handleInput(input)
  }

  // Serialize for save/load
  serialize(): { current: string | null; stack: string[] } {
    return { current: this.current?.name ?? null, stack: [...this.stack] }
  }

  async restore(saved: { current: string | null; stack: string[] }): Promise<void> {
    this.stack = [...saved.stack]
    if (saved.current) {
      this.current = this.states.get(saved.current) ?? null
      if (this.current?.enter) await this.current.enter()
    }
  }
}

// --- Usage Example ---
/*
const sm = new StateMachine()

sm.register({
  name: 'menu',
  enter: () => showMainMenu(),
  handleInput: (input) => {
    if (input.key === 'Enter') sm.transition('playing')
  }
})

sm.register({
  name: 'playing',
  enter: () => startLevel(),
  exit: () => cleanupLevel(),
  update: (dt) => updateGameplay(dt),
  handleInput: (input) => {
    if (input.key === 'Escape') sm.transition('paused')
    if (playerDead) sm.transition('gameover')
  }
})

sm.register({
  name: 'paused',
  enter: () => showPauseMenu(),
  handleInput: (input) => {
    if (input.key === 'Escape') sm.back()  // Resume playing, not go to menu
  }
})

sm.register({
  name: 'gameover',
  enter: () => showGameOverScreen(),
  handleInput: (input) => {
    if (input.key === 'Enter') sm.transition('menu')
  }
})

// Start the game
await sm.transition('menu')
*/

export { StateMachine }
export type { GameStateConfig, GameInput }
