'use client'

// Cola IndexedDB para bumps hechos sin red en el KDS — ver PLAN-FASE-2.md "Offline (Opción A)".
// Se vacía sola al reconectar (ver useComandas: listener de 'online').

const DB_NAME = 'kos-offline'
const DB_VERSION = 1
const STORE = 'bump_queue'

export interface BumpQueueItem {
  id: string
  tipo: 'item' | 'comanda'
  targetId: string
  /** Solo para tipo 'comanda' — ids de los ítems a bumpear (snapshot al momento de encolar). */
  itemIds?: string[]
  ts: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function encolarBump(entry: Omit<BumpQueueItem, 'id' | 'ts'>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ ...entry, id: crypto.randomUUID(), ts: Date.now() } satisfies BumpQueueItem)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function leerCola(): Promise<BumpQueueItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve((req.result as BumpQueueItem[]).sort((a, b) => a.ts - b.ts))
    req.onerror = () => reject(req.error)
  })
}

export async function quitarDeCola(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
