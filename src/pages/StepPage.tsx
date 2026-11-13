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

  // список слов диктанта считается один раз при входе в степ, иначе диктант мог
  // всплыть посреди степа, когда меняется прогресс (например, в начале нового модуля)
  const showDictation = dictItems.length > 0 && !progress.steps[key]?.dictationDone

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
  const retakeAt = progress.steps[key]?.retakeAt
  const allEx = [...s.together, ...s.self]
  const retakeDone = retakeAt
    ? allEx.filter((e) => progress.results[exKey(m, e.id)]?.some((r) => r.finishedAt >= retakeAt)).length
    : 0
  const retakeComplete = !!retakeAt && retakeDone === allEx.length
  const retakeScore = (() => {
    if (!retakeAt) return null
    const xs = allEx
      .map((e) => progress.results[exKey(m, e.id)]?.find((r) => r.finishedAt >= retakeAt)?.scoreFirst)
      .filter((x): x is number => x != null)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  })()
  const startRetake = () => {
    update((p) => {
      const st = (p.steps[key] ??= { timeMs: 0 })
      st.retakeAt = Date.now()
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const stopRetake = () =>
    update((p) => {
      const st = p.steps[key]
      if (st) delete st.retakeAt
    })
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
      <div className="step-progress" aria-label={`Выполнено ${retakeAt ? retakeDone : done} из ${total}`}>
        <div className="bar">
          <i style={{ width: `${((retakeAt ? retakeDone : done) / total) * 100}%` }} />
        </div>
        <span>
          {retakeAt ? retakeDone : done} из {total}
        </span>
      </div>

      {retakeAt && (
        <aside className="retake-note">
          <p>
            <b>Повторное прохождение.</b> Задания снова пустые. В статистике и отчётах остаётся первый результат.
          </p>
          <button className="ghost small" onClick={stopRetake}>
            {retakeComplete ? 'Показать первые ответы' : 'Отменить повтор'}
          </button>
        </aside>
      )}

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

      <Section title="Учимся вместе" sub="Учебник" exercises={s.together} moduleId={m.id} save={save} retakeAt={retakeAt} canReveal={complete || justCompleted} />
      <Section title="Учимся самостоятельно" sub="Рабочая тетрадь" exercises={s.self} moduleId={m.id} save={save} retakeAt={retakeAt} canReveal={complete || justCompleted} />

      {(complete || justCompleted) && (!retakeAt || retakeComplete) && (
        <section className="step-done">
          <div className="sd-stars" aria-label={`${stars(sc)} из 3 звёзд`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < stars(sc) ? 'on' : ''}>★</span>
            ))}
          </div>
          <h2>Step {s.number} пройден</h2>
          <p>Точность с первой попытки: {sc == null ? '—' : `${Math.round(sc * 100)}%`}.</p>
          {retakeComplete && (
            <p className="retake-score">Повторное прохождение: {retakeScore == null ? '—' : `${Math.round(retakeScore * 100)}%`}.</p>
          )}
          <p className="sd-hint">Под каждым заданием теперь есть кнопка «Показать ответ».</p>
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
          <div className="sd-actions">
          <button className="ghost" onClick={startRetake}>
            Пройти степ заново
          </button>
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
          </div>
        </section>
      )}
    </div>
  )
}

function Section({
  title,
  sub,
  exercises,
  moduleId,
  save,
  retakeAt,
  canReveal
}: {
  title: string
  sub: string
  exercises: Exercise[]
  moduleId: string
  save: (ex: Exercise) => (r: ExResult) => void
  retakeAt?: number
  canReveal: boolean
}) {
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
            key={`${ex.id}-${retakeAt ?? 0}`}
            ex={ex}
            moduleId={moduleId}
            previous={
              retakeAt
                ? progress.results[exKey(moduleId, ex.id)]?.filter((r) => r.finishedAt >= retakeAt).pop()
                : progress.results[exKey(moduleId, ex.id)]?.[0]
            }
            onComplete={save(ex)}
            authorMode={progress.settings.authorMode}
            canReveal={canReveal}
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
