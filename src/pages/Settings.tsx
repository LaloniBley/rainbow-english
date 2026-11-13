import { useRef, useState } from 'react'
import { useStore } from '../store'
import { importModuleZip } from '../importer'
import { emptyProgress } from '../db'
import type { Progress } from '../types'
import { href } from '../router'

export default function Settings() {
  const { modules, progress, update, installModule, config, flushOutbox, queueReport, replaceProgress, name } = useStore()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; details?: string[] } | null>(null)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const progRef = useRef<HTMLInputElement>(null)

  const onFile = async (f?: File | null) => {
    if (!f) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await importModuleZip(f)
      if (!res.module) {
        setMsg({ kind: 'err', text: 'Модуль не добавлен.', details: res.errors })
        return
      }
      const existing = modules.find((m) => m.id === res.module!.id)
      if (existing && existing.version > res.module.version) {
        if (!window.confirm(`У тебя уже стоит версия ${existing.version}, а в файле — ${res.module.version}. Заменить на более старую?`)) return
      }
      await installModule(res.module, res.media)
      setMsg({
        kind: 'ok',
        text: existing
          ? `Модуль ${res.module.number} обновлён до версии ${res.module.version}. Прогресс сохранён.`
          : `Модуль ${res.module.number} «${res.module.title}» добавлен.`,
        details: res.warnings.length ? ['Предупреждения:', ...res.warnings] : undefined
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rainbow-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importProgress = async (f?: File | null) => {
    if (!f) return
    try {
      const p = JSON.parse(await f.text()) as Progress
      if (p.version !== 1 || !p.results) throw new Error('не похоже на файл прогресса')
      if (!window.confirm('Заменить весь текущий прогресс данными из файла?')) return
      replaceProgress({ ...emptyProgress(), ...p })
      setMsg({ kind: 'ok', text: 'Прогресс восстановлен из файла.' })
    } catch (e) {
      setMsg({ kind: 'err', text: `Не получилось прочитать файл: ${(e as Error).message}.` })
    } finally {
      if (progRef.current) progRef.current.value = ''
    }
  }

  const pending = progress.outbox.filter((o) => !o.sentAt)
  const lastSent = [...progress.outbox].filter((o) => o.sentAt).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0]

  return (
    <div className="page narrow settings">
      <h1>Модули и настройки</h1>

      <section className="panel">
        <h2>Модули курса</h2>
        {modules.length === 0 && <p className="muted">Пока нет ни одного модуля.</p>}
        <ul className="mod-list">
          {modules.map((m) => (
            <li key={m.id} style={{ ['--mc' as string]: m.color }}>
              <span className="dot" />
              <b>Модуль {m.number}</b> {m.title}
              <small>
                Steps {m.steps[0]?.number}–{m.steps[m.steps.length - 1]?.number}, версия {m.version}
              </small>
            </li>
          ))}
        </ul>
        <div
          className={`drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            onFile(e.dataTransfer.files[0])
          }}
        >
          <p>Перетащи сюда файл модуля (например, module-02.zip) или</p>
          <button className="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Добавляю…' : 'Выбрать файл модуля'}
          </button>
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <p className="muted">
          Подробно — в <a href={href({ name: 'help' })}>инструкции</a>.
        </p>
        {msg && (
          <div className={`notice ${msg.kind}`} role="status">
            <p>{msg.text}</p>
            {msg.details && (
              <ul>
                {msg.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Отчёты</h2>
        {config.web3formsKey ? (
          <>
            <p>После каждого степа и контрольной отчёт уходит на почту автоматически.</p>
            <p className="muted">
              {pending.length ? `Ждут отправки: ${pending.length}${pending[0].error ? ` (последняя ошибка: ${pending[0].error})` : ''}.` : 'Очередь пуста.'}
              {lastSent && ` Последний отчёт ушёл ${new Date(lastSent.sentAt!).toLocaleString('ru-RU')}.`}
            </p>
            <div className="row">
              {pending.length > 0 && (
                <button className="ghost" onClick={() => flushOutbox()}>
                  Отправить сейчас
                </button>
              )}
              <button className="ghost" onClick={() => queueReport('Rainbow English: проверка связи', `${name} проверяет отправку отчётов. Всё работает.`)}>
                Отправить проверочное письмо
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Ключ Web3Forms не указан в config.json — отчёты не отправляются, статистика хранится только здесь.</p>
        )}
      </section>

      <section className="panel">
        <h2>Резервная копия прогресса</h2>
        <p className="muted">Прогресс хранится в браузере. Если очистить данные браузера, он пропадёт — поэтому раз в модуль сохраняй копию.</p>
        <div className="row">
          <button className="ghost" onClick={exportProgress}>
            Сохранить копию в файл
          </button>
          <button className="ghost" onClick={() => progRef.current?.click()}>
            Восстановить из файла
          </button>
          <input ref={progRef} type="file" accept=".json,application/json" hidden onChange={(e) => importProgress(e.target.files?.[0])} />
        </div>
      </section>

      <section className="panel">
        <h2>Личное</h2>
        <label className="field">
          <span>Имя в приветствии и отчётах</span>
          <input value={progress.settings.name ?? ''} placeholder={config.studentName ?? 'Имя'} onChange={(e) => update((p) => (p.settings.name = e.target.value))} />
        </label>
      </section>

      <details className="panel author">
        <summary>Для автора курса</summary>
        <label className="toggle">
          <input
            type="checkbox"
            checked={progress.settings.authorMode}
            onChange={(e) => {
              const on = e.target.checked
              if (on && !window.confirm('Режим автора открывает все степы и контрольные без ограничений и показывает id упражнений. Включить?')) return
              update((p) => (p.settings.authorMode = on))
            }}
          />
          <span>Режим автора: всё открыто, видны id упражнений</span>
        </label>
      </details>
    </div>
  )
}
