import { openDB, type IDBPDatabase } from 'idb'
import type { Module, Progress } from './types'

const DB_NAME = 'rainbow-english'
let dbp: Promise<IDBPDatabase> | null = null

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('modules')
        d.createObjectStore('media')
        d.createObjectStore('kv')
      }
    })
  }
  return dbp
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist()
  } catch {
    /* браузер может отказать — не критично */
  }
}

export async function loadModules(): Promise<Module[]> {
  const d = await db()
  const all = (await d.getAll('modules')) as Module[]
  return all.sort((a, b) => a.number - b.number)
}

export async function saveModule(m: Module, media: Map<string, Blob>) {
  const d = await db()
  const tx = d.transaction(['modules', 'media'], 'readwrite')
  // убрать старые медиа этого модуля
  const mediaStore = tx.objectStore('media')
  let cursor = await mediaStore.openCursor()
  while (cursor) {
    if (String(cursor.key).startsWith(m.id + '/')) await cursor.delete()
    cursor = await cursor.continue()
  }
  for (const [path, blob] of media) await mediaStore.put(blob, `${m.id}/${path}`)
  await tx.objectStore('modules').put(m, m.id)
  await tx.done
}

export async function getMedia(moduleId: string, path: string): Promise<Blob | undefined> {
  const d = await db()
  return d.get('media', `${moduleId}/${path}`)
}

const EMPTY: Progress = {
  version: 1,
  results: {},
  steps: {},
  dictations: [],
  words: {},
  tests: [],
  activity: {},
  achievements: {},
  outbox: [],
  drafts: {},
  settings: { sound: true, authorMode: false }
}

export function emptyProgress(): Progress {
  return JSON.parse(JSON.stringify(EMPTY))
}

export async function loadProgress(): Promise<Progress> {
  const d = await db()
  const p = (await d.get('kv', 'progress')) as Progress | undefined
  return p ? { ...emptyProgress(), ...p, settings: { ...EMPTY.settings, ...p.settings } } : emptyProgress()
}

export async function saveProgress(p: Progress) {
  const d = await db()
  await d.put('kv', p, 'progress')
}
