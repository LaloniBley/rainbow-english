import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { loadModules, loadProgress, requestPersistence, saveModule, saveProgress } from './db'
import type { AppConfig, Module, OutboxItem, Progress } from './types'
import { makeOutbox, sendReport } from './report'
import { clearMediaCache } from './media'
import { dateKey } from './logic'

interface Store {
  ready: boolean
  config: AppConfig
  modules: Module[]
  progress: Progress
  update: (fn: (p: Progress) => void) => void
  installModule: (m: Module, media: Map<string, Blob>) => Promise<void>
  queueReport: (subject: string, message: string) => void
  flushOutbox: () => Promise<void>
  replaceProgress: (p: Progress) => void
  name: string
}

const Ctx = createContext<Store | null>(null)

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('store')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [config, setConfig] = useState<AppConfig>({})
  const [modules, setModules] = useState<Module[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const saveTimer = useRef<number>()
  const progRef = useRef<Progress | null>(null)
  const configRef = useRef<AppConfig>({})
  const flushing = useRef(false)

  useEffect(() => {
    ;(async () => {
      const [mods, prog] = await Promise.all([loadModules(), loadProgress()])
      let cfg: AppConfig = {}
      try {
        const r = await fetch('./config.json', { cache: 'no-store' })
        if (r.ok) cfg = await r.json()
      } catch {
        /* офлайн — берём из кеша сервис-воркера или пусто */
      }
      configRef.current = cfg
      setConfig(cfg)
      setModules(mods)
      progRef.current = prog
      setProgress(prog)
      setReady(true)
      requestPersistence()
    })()
  }, [])

  const persist = useCallback((p: Progress) => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => saveProgress(p), 300)
  }, [])

  const update = useCallback(
    (fn: (p: Progress) => void) => {
      const cur = progRef.current
      if (!cur) return
      const next = structuredClone(cur)
      fn(next)
      progRef.current = next
      setProgress(next)
      persist(next)
    },
    [persist]
  )

  const flushOutbox = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    const pending = (progRef.current?.outbox ?? []).filter((o) => !o.sentAt)
    if (!pending.length) return
    flushing.current = true
    try {
      for (const item of pending) {
        const res = await sendReport(configRef.current, item)
        update((p) => {
          const o = p.outbox.find((x) => x.id === item.id)
          if (!o) return
          o.tries += 1
          if (res.ok) {
            o.sentAt = Date.now()
            o.error = undefined
          } else o.error = res.error
          // храним только последние 60 отправленных
          const sent = p.outbox.filter((x) => x.sentAt)
          if (sent.length > 60) {
            const drop = new Set(sent.slice(0, sent.length - 60).map((x) => x.id))
            p.outbox = p.outbox.filter((x) => !drop.has(x.id))
          }
        })
        if (!res.ok) break
      }
    } finally {
      flushing.current = false
    }
  }, [update])

  const queueReport = useCallback(
    (subject: string, message: string) => {
      if (!configRef.current.web3formsKey) return
      const item: OutboxItem = makeOutbox(subject, message)
      update((p) => {
        p.outbox.push(item)
      })
      setTimeout(() => flushOutbox(), 50)
    },
    [update, flushOutbox]
  )

  useEffect(() => {
    if (!ready) return
    flushOutbox()
    const on = () => flushOutbox()
    window.addEventListener('online', on)
    const t = window.setInterval(on, 5 * 60 * 1000)
    return () => {
      window.removeEventListener('online', on)
      window.clearInterval(t)
    }
  }, [ready, flushOutbox])

  // учёт времени занятий: пока вкладка видима и есть активность
  useEffect(() => {
    if (!ready) return
    let lastInput = Date.now()
    const mark = () => (lastInput = Date.now())
    window.addEventListener('pointerdown', mark)
    window.addEventListener('keydown', mark)
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastInput > 3 * 60 * 1000) return
      update((p) => {
        const k = dateKey()
        p.activity[k] = (p.activity[k] ?? 0) + 0.5
      })
    }, 30000)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('pointerdown', mark)
      window.removeEventListener('keydown', mark)
    }
  }, [ready, update])

  const installModule = useCallback(async (m: Module, media: Map<string, Blob>) => {
    clearMediaCache(m.id)
    await saveModule(m, media)
    setModules(await loadModules())
  }, [])

  const replaceProgress = useCallback(
    (p: Progress) => {
      progRef.current = p
      setProgress(p)
      saveProgress(p)
    },
    []
  )

  if (!progress) return <div className="boot">Загрузка…</div>

  const name = progress.settings.name || config.studentName || 'Ученица'

  return (
    <Ctx.Provider value={{ ready, config, modules, progress, update, installModule, queueReport, flushOutbox, replaceProgress, name }}>
      {children}
    </Ctx.Provider>
  )
}
