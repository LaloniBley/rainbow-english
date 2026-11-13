import { useMemo, useRef, useState } from 'react'
import type { ExResult, Exercise } from '../types'
import { fieldsFor, isFilled, scoreFields, type Answers, type FieldDef } from '../fields'
import { TypeBody } from './types'
import { AudioList, Img } from '../components/media'
import { sourceLabel } from '../logic'

const TYPE_HINT: Record<string, string> = {
  listen_repeat: 'Слушай и повторяй вслух',
  info: 'Прочитай',
  choose: 'Выбери ответ',
  match: 'Соедини пары',
  gap: 'Впиши пропущенное',
  copy: 'Пропиши по образцу',
  order: 'Расставь номера',
  sort: 'Разложи по группам',
  word_set: 'Найди слова',
  free: 'Свободный ответ'
}

export function ExHeader({ ex, moduleId, onPlay, authorMode }: { ex: Exercise; moduleId: string; onPlay?: () => void; authorMode?: boolean }) {
  return (
    <>
      <div className="ex-meta">
        <span className="ex-kind">{TYPE_HINT[ex.type]}</span>
        <span className="ex-source">{sourceLabel(ex.source)}</span>
        {authorMode && <code className="ex-id">{ex.id}</code>}
      </div>
      <h3 className="ex-instruction">{ex.instruction}</h3>
      {ex.note && <p className="ex-note">{ex.note}</p>}
      {ex.audio && <AudioList moduleId={moduleId} audio={ex.audio} onPlay={onPlay} />}
      {ex.img && <Img moduleId={moduleId} src={ex.img} className="ex-img" />}
      {ex.images && (
        <div className="ex-images">
          {ex.images.map((i) => (
            <Img key={i} moduleId={moduleId} src={i} className="ex-img small" />
          ))}
        </div>
      )}
    </>
  )
}

type Phase = 'answer' | 'retry' | 'done'

export function ExerciseView({
  ex,
  moduleId,
  previous,
  onComplete,
  authorMode,
  canReveal
}: {
  ex: Exercise
  moduleId: string
  previous?: ExResult
  onComplete: (r: ExResult) => void
  authorMode?: boolean
  /** можно показать ответ (степ завершён) */
  canReveal?: boolean
}) {
  const fields = useMemo(() => fieldsFor(ex), [ex])
  // есть ли у упражнения ключ (хотя бы одно поле проверяется автоматически)
  const scorable = !ex.teacher && fields.some((f) => f.check({}) !== null)
  const [answers, setAnswers] = useState<Answers>({})
  const [phase, setPhase] = useState<Phase>(previous ? 'done' : 'answer')
  const [marks, setMarks] = useState<Record<string, boolean | null>>(() => {
    if (!previous) return {}
    const m: Record<string, boolean | null> = {}
    previous.fields.forEach((f) => (m[f.key] = f.correct))
    return m
  })
  const firstMarks = useRef<Record<string, boolean | null>>({})
  const firstCredit = useRef<Record<string, number>>({})
  const credits = useRef<Record<string, number>>({})
  const [showKey, setShowKey] = useState(false)
  const listens = useRef(0)
  const started = useRef(Date.now())
  const [msg, setMsg] = useState('')
  const [result, setResult] = useState<ExResult | undefined>(previous)
  const [redo, setRedo] = useState(false)

  const set = (key: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [key]: value }))
    setMsg('')
  }

  const locked = (key: string) => phase === 'done' || (phase === 'retry' && marks[key] === true)

  const finalize = (final: Record<string, boolean | null>, a: Answers, selfMark?: 'ok' | 'errors') => {
    const fr = fields.map((f) => ({
      key: f.key,
      label: f.label,
      given: f.given(a),
      expected: f.expected,
      correct: final[f.key] ?? null,
      firstTry: firstMarks.current[f.key] ?? final[f.key] ?? null,
      ...(f.credit ? { part: credits.current[f.key] ?? 0, partFirst: firstCredit.current[f.key] ?? credits.current[f.key] ?? 0 } : {})
    }))
    const r: ExResult = {
      exId: ex.id,
      moduleId,
      fields: fr,
      scoreFirst: scoreFields(fr, true),
      scoreFinal: scoreFields(fr, false),
      selfMark,
      listens: listens.current,
      startedAt: started.current,
      finishedAt: Date.now(),
      teacher: !!ex.teacher || fr.some((f) => f.correct === null)
    }
    setResult(r)
    setPhase('done')
    if (!previous || redo) onComplete(r)
  }

  const check = () => {
    const empty = fields.filter((f) => f.required && !isFilled(f, answers))
    if (empty.length) {
      setMsg(`Заполни все поля — осталось ${empty.length}.`)
      return
    }
    const m: Record<string, boolean | null> = {}
    fields.forEach((f) => (m[f.key] = f.check(answers)))
    const c: Record<string, number> = {}
    fields.forEach((f) => {
      if (f.credit) c[f.key] = m[f.key] ? 1 : f.credit(answers)
    })
    credits.current = c
    setMarks(m)
    if (!scorable) {
      firstMarks.current = m
      finalize(m, answers)
      return
    }
    if (phase === 'answer') {
      firstMarks.current = m
      firstCredit.current = c
      const wrong = Object.values(m).filter((x) => x === false).length
      if (wrong === 0) finalize(m, answers)
      else {
        setPhase('retry')
        setMsg(`Ошибок: ${wrong}. Исправь подсвеченное — это вторая попытка.`)
      }
    } else finalize(m, answers)
  }

  const noFields = fields.length === 0
  const hasCheckAudio = !!ex.checkAudio
  const needSelfMark = hasCheckAudio && (noFields || !scorable)
  const [selfMark, setSelfMark] = useState<'ok' | 'errors' | undefined>(previous?.selfMark)

  const reveal = phase === 'done'
  const keyLines = answerKeyLines(ex, fields)
  // в заданиях с самопроверкой образец нужен сразу, в остальных — после завершения степа
  const keyAllowed = phase === 'done' && keyLines.length > 0 && (needSelfMark || !!canReveal || !scorable)

  return (
    <article className={`exercise ${phase === 'done' ? 'is-done' : ''}`} id={`ex-${ex.id}`}>
      <ExHeader ex={ex} moduleId={moduleId} onPlay={() => (listens.current += 1)} authorMode={authorMode} />

      {previous && !redo && fields.length > 0 ? (
        <ResultView r={previous} />
      ) : (
        <TypeBody ex={ex} moduleId={moduleId} answers={answers} set={set} marks={marks} locked={locked} reveal={reveal} />
      )}

      {phase === 'done' && hasCheckAudio && (
        <div className="checkback">
          <div className="checkback-title">Проверь себя по записи</div>
          <AudioList moduleId={moduleId} audio={ex.checkAudio} label="Проверка" />
          {needSelfMark && (
            <div className="selfmark">
              <span>Как получилось?</span>
              <button
                className={`chip ${selfMark === 'ok' ? 'on' : ''}`}
                onClick={() => {
                  setSelfMark('ok')
                  if (result) onComplete({ ...result, selfMark: 'ok' })
                }}
              >
                Всё совпало
              </button>
              <button
                className={`chip ${selfMark === 'errors' ? 'on' : ''}`}
                onClick={() => {
                  setSelfMark('errors')
                  if (result) onComplete({ ...result, selfMark: 'errors' })
                }}
              >
                Были ошибки
              </button>
            </div>
          )}
        </div>
      )}

      {keyAllowed && showKey && (
        <div className="answer-key">
          <div className="ak-title">{scorable ? 'Правильные ответы' : 'Образец ответа'}</div>
          <ul>
            {keyLines.map((l, i) => (
              <li key={i}>
                {l.label && <span className="ak-label">{l.label}</span>}
                <span className="ak-value">{l.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="ex-foot">
        {msg && <span className="ex-msg">{msg}</span>}
        {phase !== 'done' && (noFields ? (
          <button className="primary" onClick={() => finalize({}, {})}>
            Выполнено
          </button>
        ) : (
          <button className="primary" onClick={check}>
            {!scorable ? 'Готово' : phase === 'retry' ? 'Проверить ещё раз' : 'Проверить'}
          </button>
        ))}
        {phase === 'done' && (
          <>
            <ResultBadge r={result} />
            {keyAllowed && (
              <button className="ghost small" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Скрыть ответ' : 'Показать ответ'}
              </button>
            )}
            <button
              className="ghost small"
              onClick={() => {
                setAnswers({})
                setMarks({})
                firstMarks.current = {}
                firstCredit.current = {}
                credits.current = {}
                setShowKey(false)
                started.current = Date.now()
                setPhase('answer')
                setRedo(true)
                setMsg('Повторное прохождение: в статистике остаётся первый результат.')
              }}
            >
              Пройти ещё раз
            </button>
          </>
        )}
      </footer>
    </article>
  )
}

export function ResultBadge({ r }: { r?: ExResult }) {
  if (!r) return null
  if (r.scoreFirst == null) return <span className="result-badge neutral">{r.fields.length ? 'Ответ сохранён' : 'Выполнено'}</span>
  const p = Math.round(r.scoreFirst * 100)
  return <span className={`result-badge ${p >= 90 ? 'great' : p >= 70 ? 'good' : 'weak'}`}>{p}% с первой попытки</span>
}

export function ResultView({ r }: { r: ExResult }) {
  return (
    <ul className="result-list">
      {r.fields.map((f) => (
        <li key={f.key} className={f.correct === true ? 'ok' : f.correct === false ? 'bad' : ''}>
          <span className="rl-label">{f.label}</span>
          <span className="rl-given">{f.given || '—'}</span>
          {f.correct === false && f.part != null && f.part > 0 && <span className="rl-note">частично: {Math.round(f.part * 100)}%</span>}
          {f.correct === false && f.expected && <span className="expected">{f.expected}</span>}
          {f.correct === true && f.firstTry === false && <span className="rl-note">со 2-й попытки</span>}
        </li>
      ))}
    </ul>
  )
}

/** строки для «Показать ответ» */
export function answerKeyLines(ex: Exercise, fields: FieldDef[]): { label?: string; value: string }[] {
  if (ex.answerKey?.length) return ex.answerKey.map((v) => ({ value: v }))
  if (ex.type === 'word_set') return [{ label: 'Подходят слова', value: ex.accept.join(', ') }]
  if (ex.type === 'copy') return []
  const out: { label?: string; value: string }[] = []
  const seen = new Set<string>()
  for (const f of fields) {
    if (!f.expected) continue
    const k = f.label + '|' + f.expected
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ label: f.label, value: f.expected })
  }
  return out
}
