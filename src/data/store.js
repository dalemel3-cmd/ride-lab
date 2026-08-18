/**
 * Offline-first data layer.
 *
 * The design constraint: Bentonville singletrack has dead zones, and a ride
 * that fails to save is a hole in a four-month dataset that can never be
 * recovered. So every write goes to localStorage first and Supabase second. If
 * the network write fails for any reason, the record stays in a durable queue
 * and is retried later — the UI reports success either way, because the data is
 * genuinely safe on the device.
 *
 * Deliberately absent: a "minimalist fallback insert" that strips unknown
 * columns to force a write through. That pattern turns a missing migration into
 * silent data loss — the row saves, minus the RPE and the GPS track. A row that
 * cannot be written correctly stays queued and visible instead.
 */

import { supabase } from '../supabaseClient.js'

export const TABLES = {
  rides: 'rides',
  bodyComp: 'body_comp',
  journal: 'journal_entries',
  routes: 'routes',
}

const CACHE_KEYS = {
  [TABLES.rides]: 'ridelab_rides',
  [TABLES.bodyComp]: 'ridelab_body_comp',
  [TABLES.journal]: 'ridelab_journal',
  [TABLES.routes]: 'ridelab_routes',
}

const QUEUE_KEY = 'ridelab_offline_queue'

/** Column each table is sorted by, newest first. */
const SORT_COLUMN = {
  [TABLES.rides]: 'ridden_at',
  [TABLES.bodyComp]: 'measured_at',
  [TABLES.journal]: 'entry_date',
  [TABLES.routes]: 'name',
}

// ---------------------------------------------------------------------------
// localStorage helpers — every access is guarded. Private browsing, a full
// quota, or a locked-down webview must degrade the app, never crash it.
// ---------------------------------------------------------------------------

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Local ids
// ---------------------------------------------------------------------------

/**
 * A real UUID, so a row created offline keeps the same id once it syncs.
 *
 * This is what makes the queue idempotent: retrying an insert that actually
 * succeeded collides on the primary key rather than creating a duplicate ride.
 */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for older webviews without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export function readCache(table) {
  const rows = readJson(CACHE_KEYS[table], [])
  return Array.isArray(rows) ? rows : []
}

export function writeCache(table, rows) {
  writeJson(CACHE_KEYS[table], rows)
}

function sortRows(table, rows) {
  const column = SORT_COLUMN[table]
  const sorted = [...rows]
  if (column === 'name') {
    sorted.sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')))
  } else {
    // Newest first.
    sorted.sort((a, b) => String(b[column] ?? '').localeCompare(String(a[column] ?? '')))
  }
  return sorted
}

/** Merge rows by id, preferring `incoming`. Used to fold cloud onto cache. */
function mergeById(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]))
  for (const row of incoming) byId.set(row.id, row)
  return [...byId.values()]
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

export function readQueue() {
  const queue = readJson(QUEUE_KEY, [])
  return Array.isArray(queue) ? queue : []
}

function writeQueue(queue) {
  writeJson(QUEUE_KEY, queue)
}

export function queueLength() {
  return readQueue().length
}

/**
 * Add an operation to the queue, replacing any earlier pending op for the same
 * row so an edit made twice offline syncs once, in its final state.
 */
function enqueue(op) {
  const queue = readQueue().filter(
    (existing) => !(existing.table === op.table && existing.id === op.id),
  )
  queue.push({ ...op, queued_at: new Date().toISOString(), retry_count: 0 })
  writeQueue(queue)
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Load a table: cache immediately, then the cloud if it answers.
 *
 * Returns `{ rows, fromCache }` so the UI can show data instantly and quietly
 * reconcile, rather than blocking on a spinner at a trailhead.
 */
export async function loadTable(table) {
  const cached = sortRows(table, readCache(table))

  try {
    const { data, error } = await supabase.from(table).select('*')
    if (error) throw error

    // Rows still queued locally haven't reached the server yet — keep them, or
    // an unsynced ride would vanish from the list on refresh.
    const pendingIds = new Set(
      readQueue()
        .filter((op) => op.table === table)
        .map((op) => op.id),
    )
    const pendingRows = cached.filter((r) => pendingIds.has(r.id))
    const merged = sortRows(table, mergeById(data ?? [], pendingRows))

    writeCache(table, merged)
    return { rows: merged, fromCache: false }
  } catch {
    return { rows: cached, fromCache: true }
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Insert or update a row.
 *
 * Always resolves `{ row, synced }`. `synced: false` means the row is saved
 * locally and queued — a normal, non-error outcome that the UI surfaces as
 * "saved, will sync" rather than a failure.
 */
export async function saveRow(table, input) {
  const row = { ...input, id: input.id || newId() }

  // Local first: the moment this returns, the data survives a closed tab, a
  // dead battery, or a browser crash.
  const cached = readCache(table)
  const next = sortRows(table, mergeById(cached, [row]))
  writeCache(table, next)

  try {
    const { data, error } = await supabase.from(table).upsert(row).select().single()
    if (error) throw error

    // Take the server's version — it carries defaults we didn't send.
    const saved = data ?? row
    writeCache(table, sortRows(table, mergeById(next, [saved])))
    return { row: saved, synced: true }
  } catch {
    enqueue({ action: 'upsert', table, id: row.id, record: row })
    return { row, synced: false }
  }
}

/** Delete a row locally, then remotely; queues the delete if offline. */
export async function deleteRow(table, id) {
  writeCache(
    table,
    readCache(table).filter((r) => r.id !== id),
  )

  try {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return { synced: true }
  } catch {
    enqueue({ action: 'delete', table, id })
    return { synced: false }
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// Module-level lock. Sync is triggered by app load, `online`, and visibility
// change, which can easily fire together — without this they would race and
// double-write.
let syncing = false

/**
 * Drain the offline queue.
 *
 * Successful ops are dropped; failures stay queued with an incremented
 * `retry_count` so nothing is ever discarded because the network was flaky.
 */
export async function syncQueue() {
  if (syncing) return { skipped: true, synced: 0, remaining: queueLength() }

  const queue = readQueue()
  if (queue.length === 0) return { skipped: false, synced: 0, remaining: 0 }

  syncing = true
  const stillQueued = []
  let synced = 0

  try {
    for (const op of queue) {
      try {
        if (op.action === 'delete') {
          const { error } = await supabase.from(op.table).delete().eq('id', op.id)
          if (error) throw error
        } else {
          // Upsert, not insert: if a previous attempt actually reached the
          // server before the connection dropped, this converges instead of
          // failing on a duplicate key.
          const { error } = await supabase.from(op.table).upsert(op.record)
          if (error) throw error
        }
        synced += 1
      } catch {
        stillQueued.push({ ...op, retry_count: (op.retry_count ?? 0) + 1 })
      }
    }

    writeQueue(stillQueued)
    return { skipped: false, synced, remaining: stillQueued.length }
  } finally {
    syncing = false
  }
}

// ---------------------------------------------------------------------------
// Export — the escape hatch
// ---------------------------------------------------------------------------

/**
 * Everything in the app as one JSON blob.
 *
 * A four-month dataset should never be trapped in one vendor. This is also what
 * makes the case study shareable: hand someone the file and they have the raw
 * numbers behind every chart.
 */
export function exportAll() {
  return {
    exported_at: new Date().toISOString(),
    app: 'ride-lab',
    rides: readCache(TABLES.rides),
    body_comp: readCache(TABLES.bodyComp),
    journal_entries: readCache(TABLES.journal),
    routes: readCache(TABLES.routes),
    pending_sync: readQueue(),
  }
}

/** Trigger a download of the export as a .json file. */
export function downloadExport() {
  const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ride-lab-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
