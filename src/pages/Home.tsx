import { useStore } from '../store'
import { go, href } from '../router'
import {
  allSteps,
  bestGrade,
  blockTest,
  isStepComplete,
  isStepUnlocked,
  learnedWords,
  stars,
  stepDoneCount,
  stepScore,
  streak,
  testState
} from '../logic'
import type { Module } from '../types'

export const MODULE_COLORS = ['#E9483B', '#F28C28', '#F2C230', '#4CB66A', '#19A99A', '#2FA9D6', '#3A6FD8', '#5B4FD6', '#9B4FC8']
const TOTAL_MODULES = 9

function RainbowMap({ modules }: { modules: Module[] }) {
  const { progress } = useStore()
  const W = 760
  const cx = W / 2
  const cy = 372
  const R0 = 340
  const gap = 32
  const steps = allSteps(modules)
  const current = steps.find((r) => isStepUnlocked(progress, modules, r) && !isStepComplete(progress, r.m, r.s))

  return (
    <svg viewBox={`0 0 ${W} 392`} className="rainbow" role="img" aria-label="Карта курса: девять модулей радуги">
      {Array.from({ length: TOTAL_MODULES }, (_, mi) => {
        const m = modules.find((x) => x.number === mi + 1)
        const r = R0 - mi * gap
        const color = m?.color ?? MODULE_COLORS[mi]
        const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
        if (!m)
          return (
            <g key={mi}>
              <path d={arc} stroke="var(--line)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" fill="none" />
            </g>
          )
        const total = m.steps.length + 1
        const done = m.steps.filter((s) => isStepComplete(progress, m, s)).length
        const bt = blockTest(m)
        const passed = bt ? (bestGrade(progress, m, bt.id) ?? 0) >= 3 : false
        const frac = (done + (passed ? 1 : 0)) / total
        const len = Math.PI * r
        return (
          <g key={mi}>
            <path d={arc} stroke={color} strokeOpacity="0.18" strokeWidth="12" strokeLinecap="round" fill="none" />
            <path d={arc} stroke={color} strokeWidth="12" strokeLinecap="round" fill="none" strokeDasharray={`${len * frac} ${len}`} />
            {m.steps.map((s, si) => {
              const a = Math.PI - (Math.PI * (si + 0.5)) / total
              const x = cx + r * Math.cos(a)
              const y = cy - r * Math.sin(a)
              const ref = steps.find((q) => q.m.id === m.id && q.s.id === s.id)!
              const unlocked = isStepUnlocked(progress, modules, ref)
              const complete = isStepComplete(progress, m, s)
              const isCur = current?.m.id === m.id && current.s.id === s.id
              return (
                <g
                  key={s.id}
                  className={`bead ${unlocked ? 'can' : ''}`}
                  onClick={() => unlocked && go({ name: 'step', moduleId: m.id, stepId: s.id })}
                  tabIndex={unlocked ? 0 : -1}
                  onKeyDown={(e) => e.key === 'Enter' && unlocked && go({ name: 'step', moduleId: m.id, stepId: s.id })}
                >
                  <title>{`Step ${s.number}${s.summingUp ? ' · Summing Up' : ''}`}</title>
                  {isCur && <circle cx={x} cy={y} r="13" fill="none" stroke={color} strokeWidth="2" className="pulse" />}
                  <circle cx={x} cy={y} r="8.5" fill={complete ? color : '#fff'} stroke={unlocked ? color : 'var(--line)'} strokeWidth="2.5" />
                </g>
              )
            })}
            {bt && (() => {
              const a = Math.PI - (Math.PI * (total - 0.5)) / total
              const x = cx + r * Math.cos(a)
              const y = cy - r * Math.sin(a)
              const ts = testState(progress, m, bt.id)
              return (
                <g className={`bead ${ts.unlocked ? 'can' : ''}`} onClick={() => go({ name: 'test', moduleId: m.id, testId: bt.id })}>
                  <title>Контрольная</title>
                  <rect x={x - 8} y={y - 8} width="16" height="16" transform={`rotate(45 ${x} ${y})`} fill={passed ? color : '#fff'} stroke={ts.unlocked || passed ? color : 'var(--line)'} strokeWidth="2.5" />
                </g>
              )
            })()}
          </g>
        )
      })}
    </svg>
  )
}

export default function Home() {
  const { modules, progress, name } = useStore()
  const steps = allSteps(modules)
  const current = steps.find((r) => isStepUnlocked(progress, modules, r) && !isStepComplete(progress, r.m, r.s))
  const words = learnedWords(progress, modules).length
  const st = streak(progress)
  const lastModule = modules[modules.length - 1]
  const lastTest = lastModule && blockTest(lastModule)
  const testReady = !current && lastModule && lastTest && testState(progress, lastModule, lastTest.id).unlocked && (bestGrade(progress, lastModule, lastTest.id) ?? 0) < 3

  return (
    <div className="home">
      <section className="hero">
        <RainbowMap modules={modules} />
        <div className="hero-under">
          <h1>{greeting()}, {name}</h1>
          <div className="hero-stats">
            <span>
              <b>{st}</b> {plural(st, 'день', 'дня', 'дней')} подряд
            </span>
            <span>
              <b>{words}</b> {plural(words, 'слово', 'слова', 'слов')} в словарике
            </span>
          </div>
          {current ? (
            <a className="primary big" href={href({ name: 'step', moduleId: current.m.id, stepId: current.s.id })}>
              {stepDoneCount(progress, current.m, current.s).done > 0 ? 'Продолжить' : 'Начать'} Step {current.s.number}
            </a>
          ) : testReady ? (
            <a className="primary big" href={href({ name: 'test', moduleId: lastModule.id, testId: lastTest!.id })}>
              К контрольной
            </a>
          ) : (
            <p className="waiting">Все доступные степы пройдены. Новый модуль появится, когда его добавят в «Модули и настройки».</p>
          )}
        </div>
      </section>

      <section className="modules">
        {modules.map((m) => (
          <div key={m.id} className="module-card" style={{ ['--mc' as string]: m.color }}>
            <div className="module-head">
              <span className="module-num">Модуль {m.number}</span>
              <h2>{m.title}</h2>
            </div>
            <div className="step-row">
              {m.steps.map((s) => {
                const ref = steps.find((q) => q.m.id === m.id && q.s.id === s.id)!
                const unlocked = isStepUnlocked(progress, modules, ref)
                const complete = isStepComplete(progress, m, s)
                const n = stars(stepScore(progress, m, s))
                return (
                  <a
                    key={s.id}
                    className={`step-chip ${complete ? 'done' : ''} ${unlocked ? '' : 'locked'}`}
                    href={unlocked ? href({ name: 'step', moduleId: m.id, stepId: s.id }) : undefined}
                    aria-disabled={!unlocked}
                  >
                    <span className="sc-num">{s.number}</span>
                    <span className="sc-title">{s.summingUp ? 'Summing Up' : s.title}</span>
                    {complete && <span className="sc-stars" aria-label={`${n} из 3`}>{'★'.repeat(n)}{'☆'.repeat(3 - n)}</span>}
                  </a>
                )
              })}
              {m.tests.map((t) => {
                const g = bestGrade(progress, m, t.id)
                return (
                  <a key={t.id} className={`step-chip test ${g != null ? 'done' : ''}`} href={href({ name: 'test', moduleId: m.id, testId: t.id })}>
                    <span className="sc-num">КР</span>
                    <span className="sc-title">{t.title}</span>
                    {g != null && <span className="sc-grade">{g}</span>}
                  </a>
                )
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
