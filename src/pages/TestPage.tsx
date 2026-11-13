import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { href } from '../router'
import { gradeFor, pickVariant, testState, blockTest } from '../logic'
import { fieldsFor, type Answers } from '../fields'
import { ExHeader, ResultView } from '../exercises/ExerciseView'
import { TypeBody } from '../exercises/types'
import type { ExResult, Module, Test, TestSession } from '../types'
import { moduleSummary, testReport } from '../report'

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function scoreSession(m: Module, test: Test, t: TestSession): Partial<TestSession> {
  const variant = test.variants[t.variant]
  const results: ExResult[] = variant.exercises.map((ex) => {
    const a = (t.answers[ex.id] ?? {}) as Answers
    const fr = fieldsFor(ex).map((f) => {
      const c = f.check(a)
      return { key: f.key, label: f.label, given: f.given(a), expected: f.expected, correct: c, firstTry: c }
    })
    const scored = fr.filter((f) => f.correct !== null)
    const sc = scored.length ? scored.filter((f) => f.correct).length / scored.length : null
    return {
      exId: ex.id,
      moduleId: m.id,
      testSessionId: t.id,
      fields: fr,
      scoreFirst: sc,
      scoreFinal: sc,
      listens: 0,
      startedAt: t.startedAt,
      finishedAt: Date.now(),
      teacher: !!ex.teacher
    }
  })
  const all = results.flatMap((r) => r.fields).filter((f) => f.correct !== null)
  const points = all.filter((f) => f.correct).length
  const maxPoints = all.length
  const percent = maxPoints ? Math.round((points / maxPoints) * 100) : 0
  return { results, points, maxPoints, percent, grade: gradeFor(percent, m.grading) }
}

export default function TestPage({ moduleId, testId }: { moduleId: string; testId: string }) {
  const { modules, progress, update, queueReport, name } = useStore()
  const m = modules.find((x) => x.id === moduleId)
  const test = m?.tests.find((t) => t.id === testId)
  const [now, setNow] = useState(Date.now())
  const [viewId, setViewId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const progRef = useRef(progress)
  progRef.current = progress
  const exTimer = useRef<{ id: string; t: number } | null>(null)

  const st = m && test ? testState(progress, m, test.id, now) : null
  const active = st?.active

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // уход со вкладки во время контрольной
  useEffect(() => {
    if (!active) return
    const on = () => {
      if (document.visibilityState === 'hidden')
        update((p) => {
          const s = p.tests.find((x) => x.id === active.id)
          if (s && !s.submittedAt) s.focusLost += 1
        })
    }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [active?.id]) // eslint-disable-line

  const submit = (auto: boolean) => {
    if (!m || !test) return
    const cur = progRef.current.tests.find((x) => x.moduleId === m.id && x.testId === test.id && !x.submittedAt)
    if (!cur) return
    flushExTime()
    let finished: TestSession | undefined
    update((p) => {
      const s = p.tests.find((x) => x.id === cur.id)
      if (!s || s.submittedAt) return
      Object.assign(s, scoreSession(m, test, s))
      s.submittedAt = Math.min(Date.now(), s.deadline)
      s.autoSubmitted = auto
      if (s.grade === 5) p.achievements['test-5'] ??= Date.now()
      finished = structuredClone(s)
    })
    setViewId(cur.id)
    setTimeout(() => {
      if (!finished) return
      const titles: Record<string, string> = {}
      test.variants[finished.variant].exercises.forEach((ex, i) => (titles[ex.id] = `Задание ${i + 1}`))
      const rep = testReport(m, finished, test.title, name, titles)
      queueReport(rep.subject, rep.message)
      if (test.kind === 'block' && blockTest(m)?.id === test.id) {
        const sum = moduleSummary(progRef.current, modules, m, name)
        queueReport(sum.subject, sum.message)
      }
    }, 300)
  }

  // авто-сдача по таймеру, в том числе если приложение открыли после дедлайна
  useEffect(() => {
    if (active && now >= active.deadline) submit(true)
  }, [now, active?.id]) // eslint-disable-line

  const flushExTime = () => {
    const cur = exTimer.current
    if (!cur || !active) return
    const dt = Date.now() - cur.t
    exTimer.current = { id: cur.id, t: Date.now() }
    update((p) => {
      const s = p.tests.find((x) => x.id === active.id)
      if (s) s.timePerEx[cur.id] = (s.timePerEx[cur.id] ?? 0) + dt
    })
  }
  const touchEx = (id: string) => {
    if (exTimer.current?.id === id) return
    flushExTime()
    exTimer.current = { id, t: Date.now() }
  }

  if (!m || !test) return <div className="page narrow"><p>Контрольная не найдена.</p></div>

  const viewed = progress.tests.find((t) => t.id === viewId)

  // ----- результаты -----
  if (viewed && viewed.submittedAt) {
    const v = test.variants[viewed.variant]
    return (
      <div className="page narrow test-result">
        <div className={`grade grade-${viewed.grade}`}>{viewed.grade}</div>
        <h1>{test.title}</h1>
        <p>
          {viewed.points} из {viewed.maxPoints} баллов ({viewed.percent}%), вариант {viewed.variant + 1}.
          {viewed.autoSubmitted ? ' Время вышло, работа сдана автоматически.' : ''}
        </p>
        {(viewed.grade ?? 0) < 3 && <p>Для перехода к следующему модулю нужна оценка «3» или выше. Пересдать можно через сутки, другим вариантом.</p>}
        {v.exercises.map((ex, i) => {
          const r = viewed.results?.find((x) => x.exId === ex.id)
          return (
            <article key={ex.id} className="exercise is-done">
              <div className="ex-meta">
                <span className="ex-kind">Задание {i + 1}</span>
              </div>
              <h3 className="ex-instruction">{ex.instruction}</h3>
              {r && <ResultView r={r} />}
            </article>
          )
        })}
        <div className="row">
          <button className="ghost" onClick={() => setViewId(null)}>
            К списку попыток
          </button>
          <a className="primary" href="#/">
            На карту
          </a>
        </div>
      </div>
    )
  }

  // ----- идёт контрольная -----
  if (active) {
    const v = test.variants[active.variant]
    const left = active.deadline - now
    const answered = v.exercises.filter((ex) => {
      const a = (active.answers[ex.id] ?? {}) as Answers
      return fieldsFor(ex).every((f) => f.given(a).trim())
    }).length
    return (
      <div className="page test-page">
        <div className={`test-bar ${left < 5 * 60000 ? 'warn' : ''}`}>
          <span className="tb-title">{test.title}</span>
          <span className="tb-done">
            Готово: {answered} из {v.exercises.length}
          </span>
          <span className="tb-time" aria-live="polite">
            {fmt(left)}
          </span>
          <button className="primary small" onClick={() => setConfirm(true)}>
            Сдать работу
          </button>
        </div>
        {left < 5 * 60000 && <p className="warn-line">Осталось меньше пяти минут. В 0:00 работа сдастся сама.</p>}
        {v.exercises.map((ex, i) => (
          <article key={ex.id} className="exercise" onPointerDown={() => touchEx(ex.id)} onFocus={() => touchEx(ex.id)}>
            <div className="ex-meta">
              <span className="ex-kind">Задание {i + 1}</span>
            </div>
            <ExHeader ex={{ ...ex, source: undefined }} moduleId={m.id} />
            <TypeBody
              ex={ex}
              moduleId={m.id}
              answers={(active.answers[ex.id] ?? {}) as Answers}
              set={(k, val) =>
                update((p) => {
                  const s = p.tests.find((x) => x.id === active.id)
                  if (!s || s.submittedAt) return
                  ;(s.answers[ex.id] ??= {})[k] = val
                })
              }
              marks={{}}
              locked={() => false}
              reveal={false}
            />
          </article>
        ))}
        <div className="row center">
          <button className="primary big" onClick={() => setConfirm(true)}>
            Сдать работу
          </button>
        </div>
        {confirm && (
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-box">
              <h2>Сдать работу?</h2>
              <p>
                Готово: {answered} из {v.exercises.length}. После сдачи ответы изменить нельзя.
              </p>
              <div className="row">
                <button className="ghost" onClick={() => setConfirm(false)}>
                  Вернуться к заданиям
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setConfirm(false)
                    submit(false)
                  }}
                >
                  Сдать работу
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ----- вводный экран -----
  const sessions = (st?.sessions ?? []).filter((s) => s.submittedAt)
  const start = () => {
    const variant = pickVariant(progress, m, test.id, test.variants.length)
    const t = Date.now()
    update((p) => {
      p.tests.push({
        id: `${test.id}-${t}`,
        moduleId: m.id,
        testId: test.id,
        variant,
        startedAt: t,
        deadline: t + test.minutes * 60000,
        focusLost: 0,
        answers: {},
        timePerEx: {}
      })
    })
  }

  return (
    <div className="page narrow test-intro" style={{ ['--mc' as string]: m.color }}>
      <h1>{test.title}</h1>
      <ul className="rules">
        <li>{test.minutes} минут. Таймер идёт, даже если закрыть приложение.</li>
        <li>Подсказок и проверки по ходу нет — всё проверяется после сдачи.</li>
        <li>Вариант выбирается случайно. Пересдать можно через сутки другим вариантом.</li>
        <li>Для следующего модуля нужна оценка «3» или выше. Оценка: от 90% — «5», от 75% — «4», от 50% — «3».</li>
      </ul>
      {st?.unlocked ? (
        <button className="primary big" onClick={start}>
          Начать контрольную
        </button>
      ) : (
        <p className="locked-reason">
          {st?.reason}
          {st?.nextAt && <> Откроется {new Date(st.nextAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</>}
        </p>
      )}
      {sessions.length > 0 && (
        <section className="attempts">
          <h2>Попытки</h2>
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Вариант</th>
                <th>Баллы</th>
                <th>Оценка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.startedAt).toLocaleDateString('ru-RU')}</td>
                  <td>{s.variant + 1}</td>
                  <td>
                    {s.points}/{s.maxPoints}
                  </td>
                  <td>
                    <b>{s.grade}</b>
                  </td>
                  <td>
                    <button className="ghost small" onClick={() => setViewId(s.id)}>
                      Разбор
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <a href={href({ name: 'home' })}>На карту</a>
    </div>
  )
}
