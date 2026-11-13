import { useStore } from '../store'
import { allSteps, dateKey, exKey, isStepComplete, learnedWords, stepExercises, stepScore, streak, wordKey } from '../logic'
import { SKILL_RU, moduleSummary } from '../report'
import { plural } from './Home'

export default function Stats() {
  const { modules, progress, queueReport, name, config } = useStore()
  const steps = allSteps(modules)
  const doneSteps = steps.filter((r) => isStepComplete(progress, r.m, r.s))
  const minutes = Object.values(progress.activity).reduce((a, b) => a + b, 0)
  const dicts = progress.dictations
  const dictAvg = dicts.length ? dicts.reduce((a, d) => a + d.score, 0) / dicts.length : null

  const skills: Record<string, number[]> = {}
  for (const r of steps)
    for (const ex of stepExercises(r.s)) {
      const res = progress.results[exKey(r.m, ex.id)]?.[0]
      if (res?.scoreFirst != null) (skills[ex.skill] ??= []).push(res.scoreFirst)
    }

  const weak = learnedWords(progress, modules)
    .map(({ m, w }) => ({ w, st: progress.words[wordKey(m, w)] }))
    .filter((x) => x.st && x.st.errors > 0)
    .sort((a, b) => b.st!.errors - a.st!.errors || a.st!.box - b.st!.box)
    .slice(0, 20)

  // активность: последние 12 недель
  const days: { k: string; v: number; d: Date }[] = []
  const today = new Date()
  const startOffset = (today.getDay() + 6) % 7
  for (let i = 12 * 7 - 1 + startOffset - 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const k = dateKey(d.getTime())
    days.push({ k, v: progress.activity[k] ?? 0, d })
  }
  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const tests = progress.tests.filter((t) => t.submittedAt)

  return (
    <div className="page stats-page">
      <h1>Успехи</h1>
      <div className="kpis">
        <div><b>{doneSteps.length}</b><span>из {steps.length} степов</span></div>
        <div><b>{streak(progress)}</b><span>{plural(streak(progress), 'день', 'дня', 'дней')} подряд</span></div>
        <div><b>{minutes < 60 ? Math.round(minutes) : Math.round((minutes / 60) * 10) / 10}</b><span>{minutes < 60 ? 'минут занятий' : 'часов занятий'}</span></div>
        <div><b>{dictAvg == null ? '—' : `${Math.round(dictAvg * 100)}%`}</b><span>средний диктант</span></div>
      </div>

      <section className="panel">
        <h2>Точность по степам</h2>
        <p className="muted">Доля верных ответов с первой попытки.</p>
        <div className="bars">
          {steps.map((r) => {
            const sc = stepScore(progress, r.m, r.s)
            return (
              <div key={`${r.m.id}/${r.s.id}`} className="bar-col" title={`Step ${r.s.number}: ${sc == null ? 'нет данных' : Math.round(sc * 100) + '%'}`}>
                <div className="bar-v">{sc == null ? '' : Math.round(sc * 100)}</div>
                <div className="bar-track">
                  <i style={{ height: `${(sc ?? 0) * 100}%`, background: r.m.color }} />
                </div>
                <div className="bar-x">{r.s.number}</div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Навыки</h2>
        {Object.keys(skills).length === 0 && <p className="muted">Пока нет данных.</p>}
        <div className="hbars">
          {Object.entries(skills).map(([k, arr]) => {
            const v = arr.reduce((a, b) => a + b, 0) / arr.length
            return (
              <div key={k} className="hbar">
                <span>{SKILL_RU[k] ?? k}</span>
                <div className="hbar-track"><i style={{ width: `${v * 100}%` }} /></div>
                <b>{Math.round(v * 100)}%</b>
              </div>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Диктанты</h2>
        {dicts.length === 0 ? (
          <p className="muted">Первый диктант будет перед Step 2.</p>
        ) : (
          <DictChart values={dicts.map((d) => d.score)} labels={dicts.map((d) => {
            const st = modules.find((m) => m.id === d.moduleId)?.steps.find((s) => s.id === d.stepId)
            return st ? `${st.number}` : ''
          })} />
        )}
      </section>

      <section className="panel">
        <h2>Слова с ошибками</h2>
        {weak.length === 0 ? (
          <p className="muted">Ошибок в диктантах пока нет.</p>
        ) : (
          <div className="weak">
            {weak.map(({ w, st }) => (
              <span key={w.id + w.en} className="tag">
                {w.en} <small>×{st!.errors}</small>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Контрольные</h2>
        {tests.length === 0 ? (
          <p className="muted">Ещё не было.</p>
        ) : (
          <table>
            <thead><tr><th>Дата</th><th>Работа</th><th>Баллы</th><th>Оценка</th></tr></thead>
            <tbody>
              {tests.map((t) => {
                const m = modules.find((x) => x.id === t.moduleId)
                const test = m?.tests.find((x) => x.id === t.testId)
                return (
                  <tr key={t.id}>
                    <td>{new Date(t.startedAt).toLocaleDateString('ru-RU')}</td>
                    <td>{test?.title}</td>
                    <td>{t.points}/{t.maxPoints} ({t.percent}%)</td>
                    <td><b>{t.grade}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Календарь занятий</h2>
        <div className="heat" role="img" aria-label="Минуты занятий по дням за 12 недель">
          {weeks.map((w, i) => (
            <div key={i} className="heat-col">
              {w.map((d) => (
                <i key={d.k} title={`${d.d.toLocaleDateString('ru-RU')}: ${Math.round(d.v)} мин`} className={`h${d.v === 0 ? 0 : d.v < 10 ? 1 : d.v < 25 ? 2 : 3}`} />
              ))}
            </div>
          ))}
        </div>
      </section>

      {config.web3formsKey && modules.length > 0 && (
        <div className="row">
          <button className="ghost" onClick={() => {
            const m = modules[modules.length - 1]
            const s = moduleSummary(progress, modules, m, name)
            queueReport(s.subject, s.message)
          }}>
            Отправить сводку по текущему модулю
          </button>
        </div>
      )}
    </div>
  )
}

function DictChart({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 640
  const H = 160
  const pad = 28
  const n = values.length
  const x = (i: number) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1))
  const y = (v: number) => H - pad - v * (H - 2 * pad)
  const d = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="dict-chart" role="img" aria-label="Результаты диктантов по порядку">
      <line x1={pad} x2={W - pad} y1={y(0.8)} y2={y(0.8)} className="ref" />
      <text x={W - pad} y={y(0.8) - 6} textAnchor="end" className="ref-t">порог 80%</text>
      <path d={d} className="line" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r="4" className={v >= 0.8 ? 'pt ok' : 'pt bad'} />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="ax">{labels[i]}</text>
        </g>
      ))}
    </svg>
  )
}
