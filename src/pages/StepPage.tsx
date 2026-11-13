import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { href } from '../router'
import {
  allSteps,
  blockTest,
  dictationFor,
  exKey,
  isStepComplete,
  isStepUnlocked,
  needsDictation,
  stars,
  stepDoneCount,
  stepKey,
  stepScore,
  updateWord
} from '../logic'
import { ExerciseView } from '../exercises/ExerciseView'
import Dictation from './Dictation'
import { stepReport } from '../report'
import type { ExResult, Exercise } from '../types'
import { Img, Speak } from '../components/media'

export default function StepPage({ moduleId, stepId }: { moduleId: string; stepId: string }) {
  const { modules, progress, update, queueReport, name } = useStore()
  const m = modules.find((x) => x.id === moduleId)
  const s = m?.steps.find((x) => x.id === stepId)
  const steps = allSteps(modules)
  const ref = steps.find((r) => r.m.id === moduleId && r.s.id === stepId)
  const dictItems = useMemo(() => (m && s ? dictationFor(progress, modules, m, s) : []), [m?.id, s?.id]) // eslint-disable-line
  const [justCompleted, setJustCompleted] = useState(false)
  const key = m && s ? stepKey(m, s) : ''
  const latest = useLatest(progress)

  // время на степе
  useEffect(() => {
    if (!m || !s) return
    update((p) => {
      const st = (p.steps[key] ??= { timeMs: 0 })
      st.startedAt ??= Date.now()
    })
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      update((p) => {
        const st = (p.steps[key] ??= { timeMs: 0 })
        st.timeMs += 15000
      })
    }, 15000)
    return () => window.clearInterval(t)
  }, [key]) // eslint-disable-line

  if (!m || !s || !ref) return <div className="page narrow"><p>Степ не найден. Возможно, модуль ещё не добавлен.</p><a href="#/">На карту</a></div>
  if (!isStepUnlocked(progress, modules, ref))
    return (
      <div className="page narrow locked-page">
        <h1>Step {s.number}</h1>
        <p>Этот степ откроется, когда будет пройден предыдущий{ref.index > 0 && steps[ref.index - 1].m.id !== m.id ? ' и сдана контрольная прошлого модуля на «3» или выше' : ''}.</p>
        <a className="primary" href="#/">На карту</a>
      </div>
    )

  const showDictation = needsDictation(progress, modules, m, s)

  if (showDictation)
    return (
      <div className="page narrow">
        <StepTitle num={s.number} title={s.title} summing={s.summingUp} color={m.color} />
        <Dictation
          items={dictItems}
          module={m}
          stepId={s.id}
          onFinish={(r) => {
            update((p) => {
              p.dictations.push(r)
              r.words.forEach((w) => updateWord(p, w.wordKey, w.correct))
              const st = (p.steps[key] ??= { timeMs: 0 })
              st.dictationDone = true
              if (r.score === 1) p.achievements['dictation-100'] ??= Date.now()
            })
          }}
        />
      </div>
    )

  const { done, total } = stepDoneCount(progress, m, s)
  const complete = isStepComplete(progress, m, s)
  const idx = ref.index
  const next = steps[idx + 1]

  const save = (ex: Exercise) => (r: ExResult) => {
    let becameComplete = false
    update((p) => {
      const k = exKey(m, ex.id)
      const list = (p.results[k] ??= [])
      r.stepId = s.id
      // самооценка после «Проверь себя» обновляет последнюю запись того же прохождения
      const last = list[list.length - 1]
      if (last && last.finishedAt === r.finishedAt) list[list.length - 1] = r
      else list.push(r)
      const all = [...s.together, ...s.self]
      const nowDone = all.every((e) => (p.results[exKey(m, e.id)]?.length ?? 0) > 0)
      const st = (p.steps[key] ??= { timeMs: 0 })
      if (nowDone && !st.completedAt) {
        st.completedAt = Date.now()
        becameComplete = true
      }
    })
    if (becameComplete) {
      setJustCompleted(true)
      // отчёт строим после записи прогресса
      setTimeout(() => {
        const rep = stepReport(latest.current, m, s, name)
        queueReport(rep.subject, rep.message)
      }, 400)
    }
  }

  const sc = stepScore(progress, m, s)
  const bt = blockTest(m)

  return (
    <div className="page step-page" style={{ ['--mc' as string]: m.color }}>
      <StepTitle num={s.number} title={s.title} summing={s.summingUp} color={m.color} />
      <div className="step-progress" aria-label={`Выполнено ${done} из ${total}`}>
        <div className="bar">
          <i style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span>
          {done} из {total}
        </span>
      </div>

      {s.note && (
        <aside className="teacher-note">
          <span>Записка</span>
          <p>{s.note}</p>
        </aside>
      )}

      {s.skills && s.summingUp && (
        <aside className="skills-list">
          <h3>Что ты уже умеешь</h3>
          <ul>
            {s.skills.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </aside>
      )}

      <Section title="Учимся вместе" sub="Учебник" exercises={s.together} moduleId={m.id} save={save} />
      <Section title="Учимся самостоятельно" sub="Рабочая тетрадь" exercises={s.self} moduleId={m.id} save={save} />

      {(complete || justCompleted) && (
        <section className="step-done">
          <div className="sd-stars" aria-label={`${stars(sc)} из 3 звёзд`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < stars(sc) ? 'on' : ''}>★</span>
            ))}
          </div>
          <h2>Step {s.number} пройден</h2>
          <p>Точность с первой попытки: {sc == null ? '—' : `${Math.round(sc * 100)}%`}.</p>
          {s.vocab.length > 0 && (
            <div className="new-words">
              <h3>Новые слова в словарике</h3>
              <div className="nw-list">
                {s.vocab.map((w) => (
                  <span key={w.id} className="nw">
                    {w.img && <Img moduleId={m.id} src={w.img} className="nw-img" />}
                    <b>{w.en}</b>
                    {w.ru && <small>{w.ru}</small>}
                    <Speak text={w.en} />
                  </span>
                ))}
              </div>
            </div>
          )}
          {s.summingUp && bt ? (
            <a className="primary big" href={href({ name: 'test', moduleId: m.id, testId: bt.id })}>
              К контрольной
            </a>
          ) : next && next.m.id === m.id ? (
            <a className="primary big" href={href({ name: 'step', moduleId: next.m.id, stepId: next.s.id })}>
              Дальше: Step {next.s.number}
            </a>
          ) : (
            <a className="primary big" href="#/">
              На карту
            </a>
          )}
        </section>
      )}
    </div>
  )
}

function Section({ title, sub, exercises, moduleId, save }: { title: string; sub: string; exercises: Exercise[]; moduleId: string; save: (ex: Exercise) => (r: ExResult) => void }) {
  const { progress } = useStore()
    if (!exercises.length) return null
    return (
      <section className="step-section">
        <div className="section-head">
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        {exercises.map((ex) => (
          <ExerciseView
            key={ex.id}
            ex={ex}
            moduleId={moduleId}
            previous={progress.results[exKey(moduleId, ex.id)]?.[0]}
            onComplete={save(ex)}
            authorMode={progress.settings.authorMode}
          />
        ))}
      </section>
    )
  }

function useLatest<T>(v: T) {
  const r = useRef(v)
  r.current = v
  return r
}

export function StepTitle({ num, title, summing, color }: { num: number; title: string; summing?: boolean; color: string }) {
  return (
    <div className="step-title" style={{ ['--mc' as string]: color }}>
      <span className="st-num">{num}</span>
      <div>
        <div className="st-step">Step</div>
        <h1>{summing ? 'Summing Up' : title}</h1>
      </div>
    </div>
  )
}
