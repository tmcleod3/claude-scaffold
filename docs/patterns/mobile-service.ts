/**
 * Pattern: Offline-First Mobile Service
 *
 * Key principles:
 * - Local-first: reads always hit local storage (SQLite/MMKV), writes queue for sync
 * - Optimistic UI: user sees the change immediately, sync happens in background
 * - Conflict resolution: last-write-wins with timestamp, or manual merge for critical data
 * - Network-aware: queue syncs when connection is available, pauses when offline
 * - Retry with backoff: failed syncs retry 3x with exponential backoff, then queue for later
 *
 * Agents: Stark (service logic), Thor (sync queue), Barton (error handling)
 *
 * Framework adaptations:
 *   React Native: This file (SQLite via expo-sqlite or react-native-sqlite-storage, NetInfo)
 *   Flutter: sqflite + connectivity_plus, same pattern with Dart async
 *   SwiftUI: SwiftData or Core Data + NWPathMonitor, same pattern with async/await
 *
 * The framework changes, the principle doesn't:
 * EVERY offline-capable service has: local store, sync queue, conflict resolution, retry.
 */

// --- Types ---
interface SyncQueueItem {
  id: string
  action: 'create' | 'update' | 'delete'
  entity: string
  payload: Record<string, unknown>
  timestamp: number
  retries: number
}

interface SyncResult {
  success: boolean
  serverVersion?: Record<string, unknown>
  conflict?: boolean
}

// --- Local Storage Layer ---
// In a real implementation, this would use expo-sqlite, WatermelonDB, or MMKV

class LocalStore {
  /** Read from local SQLite — always available, even offline */
  async get<T>(entity: string, id: string): Promise<T | null> {
    // SELECT * FROM {entity} WHERE id = ? — local DB
    return null as T | null // placeholder
  }

  /** Write to local SQLite + queue for sync */
  async set<T extends { id: string }>(entity: string, item: T): Promise<void> {
    // INSERT OR REPLACE INTO {entity} — local DB
    // Then queue the sync
    await SyncQueue.enqueue({
      id: item.id,
      action: 'update',
      entity,
      payload: item as Record<string, unknown>,
      timestamp: Date.now(),
      retries: 0,
    })
  }

  /** Delete locally + queue for sync */
  async delete(entity: string, id: string): Promise<void> {
    // DELETE FROM {entity} WHERE id = ? — local DB
    await SyncQueue.enqueue({
      id,
      action: 'delete',
      entity,
      payload: {},
      timestamp: Date.now(),
      retries: 0,
    })
  }

  /** List all items of an entity — local only, instant */
  async list<T>(entity: string): Promise<T[]> {
    // SELECT * FROM {entity} — local DB
    return [] as T[]
  }
}

// --- Sync Queue ---
// Persisted to SQLite so it survives app restarts

class SyncQueue {
  static async enqueue(item: SyncQueueItem): Promise<void> {
    // INSERT INTO sync_queue — persisted locally
  }

  static async processQueue(apiClient: ApiClient): Promise<void> {
    // 1. Read all pending items from sync_queue
    // 2. For each item:
    //    a. Send to server via apiClient
    //    b. If success: remove from queue
    //    c. If conflict: resolve (last-write-wins or flag for user)
    //    d. If network error: increment retries, backoff
    //    e. If retries > 3: move to dead letter (show user "sync failed" badge)
  }

  static async getPendingCount(): Promise<number> {
    // SELECT COUNT(*) FROM sync_queue — for UI badge
    return 0
  }
}

// --- Network-Aware Sync Manager ---

class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null

  /** Start periodic sync — call on app launch */
  start(apiClient: ApiClient): void {
    // Check connectivity, process queue if online
    // Re-check every 30 seconds
    this.intervalId = setInterval(() => {
      // if (NetInfo.isConnected) SyncQueue.processQueue(apiClient)
    }, 30_000)
  }

  /** Stop sync — call on app background or logout */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId)
  }

  /** Force sync — call on pull-to-refresh */
  async forceSync(apiClient: ApiClient): Promise<void> {
    await SyncQueue.processQueue(apiClient)
  }
}

// --- Conflict Resolution ---

function resolveConflict(local: SyncQueueItem, server: Record<string, unknown>): 'keep-local' | 'keep-server' {
  // Last-write-wins: compare timestamps
  const serverTimestamp = (server as { updatedAt?: number }).updatedAt ?? 0
  return local.timestamp > serverTimestamp ? 'keep-local' : 'keep-server'

  // For critical data (financial, medical), prefer 'flag-for-user' instead of auto-resolve
}

// --- API Client (placeholder) ---

interface ApiClient {
  sync(item: SyncQueueItem): Promise<SyncResult>
}

// --- Usage ---
// const store = new LocalStore()
// const syncManager = new SyncManager()
//
// // On app launch:
// syncManager.start(apiClient)
//
// // Read (always local — instant, works offline):
// const projects = await store.list<Project>('projects')
//
// // Write (local + queue sync — optimistic, works offline):
// await store.set('projects', { id: '1', name: 'New Project' })
//
// // Pull to refresh (force sync):
// await syncManager.forceSync(apiClient)
//
// // Show sync badge:
// const pending = await SyncQueue.getPendingCount()
// if (pending > 0) showBadge(`${pending} changes pending sync`)

export { LocalStore, SyncQueue, SyncManager, resolveConflict }
