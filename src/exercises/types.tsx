import { useMemo, useState } from 'react'
import type {
  ChooseEx,
  CopyEx,
  Exercise,
  FreeEx,
  GapEx,
  InfoEx,
  ListenRepeatEx,
  MatchEx,
  OrderEx,
  SortEx,
  WordSetEx
} from '../types'
import { Img, Speak } from '../components/media'
import { displaySpec, hash, parseGap, shuffle } from '../check'
import type { Answers } from '../fields'

export interface TypeProps<E extends Exercise = Exercise> {
  ex: E
  moduleId: string
  answers: Answers
  set: (key: string, value: unknown) => void
  /** результат проверки по ключу поля: true/false/null; undefined — ещё не проверяли */
  marks: Record<string, boolean | null>
  locked: (key: string) => boolean
  reveal: boolean
}

const markClass = (m: boolean | null | undefined) => (m === true ? 'ok' : m === false ? 'bad' : '')

function Expected({ show, text }: { show: boolean; text?: string }) {
  if (!show || !text) return null
  return <span className="expected">{text}</span>
}

// ---------- listen_repeat ----------
export function ListenRepeat({ ex }: TypeProps<ListenRepeatEx>) {
  if (!ex.lines?.length) return null
  return (
    <div className="lines">
      {ex.lines.map((l, i) =>
        l === '' ? (
          <div key={i} className="line-gap" />
        ) : (
          <div key={i} className="line">
            <span className="line-text">{l}</span>
            {ex.ttsLines && <Speak text={l.replace(/^[—-]\s*/, '')} />}
          </div>
        )
      )}
    </div>
  )
}

// ---------- info ----------
export function Info({ ex }: TypeProps<InfoEx>) {
  return (
    <div className="info-text">
      {ex.text.split('\n\n').map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith('**') ? <strong key={j}>{chunk.slice(2, -2)}</strong> : <span key={j}>{chunk}</span>
          )}
        </p>
      ))}
    </div>
  )
}

// ---------- choose ----------
export function Choose({ ex, moduleId, answers, set, marks, locked, reveal }: TypeProps<ChooseEx>) {
  return (
    <div className="choose-list">
      {ex.items.map((it) => {
        const v = answers[it.id]
        const sel = it.multi ? new Set(Array.isArray(v) ? (v as string[]) : []) : new Set(v ? [String(v)] : [])
        const lock = locked(it.id)
        return (
          <div key={it.id} className={`choose-item ${markClass(marks[it.id])}`}>
            {it.img && <Img moduleId={moduleId} src={it.img} className="item-img" />}
            {it.prompt && <div className="prompt">{it.prompt}</div>}
            <div className="chips" role={it.multi ? 'group' : 'radiogroup'}>
              {it.options.map((o) => {
                const on = sel.has(o)
                const isAns = reveal && it.answer?.includes(o)
                return (
                  <button
                    key={o}
                    className={`chip ${on ? 'on' : ''} ${isAns ? 'answer' : ''}`}
                    disabled={lock}
                    aria-pressed={on}
                    onClick={() => {
                      if (it.multi) {
                        const next = new Set(sel)
                        if (next.has(o)) next.delete(o)
                        else next.add(o)
                        set(it.id, it.options.filter((x) => next.has(x)))
                      } else set(it.id, o)
                    }}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- match ----------
const PAIR_COLORS = ['#E9483B', '#F28C28', '#D9A900', '#3FA45C', '#2FA9D6', '#3A6FD8', '#7A4FD6', '#D94F9A', '#14998B', '#8A6D3B']

export function Match({ ex, moduleId, answers, set, marks, locked, reveal }: TypeProps<MatchEx>) {
  const [active, setActive] = useState<string | null>(null)
  const right = useMemo(() => shuffle(ex.pairs, hash(ex.id)), [ex.id, ex.pairs])
  const leftIndex = (id: string) => ex.pairs.findIndex((p) => p.id === id)
  const ownerOf = (rightId: string) => ex.pairs.find((p) => answers[p.id] === rightId)?.id

  const pick = (rightId: string) => {
    if (!active) return
    const prevOwner = ownerOf(rightId)
    if (prevOwner && prevOwner !== active && !locked(prevOwner)) set(prevOwner, undefined)
    set(active, rightId)
    const nextFree = ex.pairs.find((p) => p.id !== active && !answers[p.id] && !locked(p.id))
    setActive(nextFree?.id ?? null)
  }

  return (
    <div className="match">
      <div className="match-col">
        {ex.leftTitle && <div className="col-title">{ex.leftTitle}</div>}
        {ex.pairs.map((p, i) => {
          const lock = locked(p.id)
          const assigned = answers[p.id] as string | undefined
          return (
            <button
              key={p.id}
              className={`match-cell left ${active === p.id ? 'active' : ''} ${markClass(marks[p.id])}`}
              disabled={lock}
              onClick={() => setActive(p.id)}
              style={{ ['--pc' as string]: PAIR_COLORS[i % PAIR_COLORS.length] }}
            >
              <span className="badge">{i + 1}</span>
              {p.leftImg ? <Img moduleId={moduleId} src={p.leftImg} className="match-img" /> : <span className="match-text">{p.left}</span>}
              {assigned && <span className="match-arrow">→ {ex.pairs.find((q) => q.id === assigned)?.right}</span>}
              {reveal && marks[p.id] === false && <span className="expected">{p.right}</span>}
            </button>
          )
        })}
      </div>
      <div className="match-col">
        {ex.rightTitle && <div className="col-title">{ex.rightTitle}</div>}
        {right.map((p) => {
          const owner = ownerOf(p.id)
          const idx = owner ? leftIndex(owner) : -1
          return (
            <button
              key={p.id}
              className={`match-cell right ${owner ? 'taken' : ''}`}
              data-pair={p.id}
              onClick={() => pick(p.id)}
              disabled={!active}
              style={idx >= 0 ? { ['--pc' as string]: PAIR_COLORS[idx % PAIR_COLORS.length] } : undefined}
            >
              {idx >= 0 && <span className="badge">{idx + 1}</span>}
              {p.rightImg ? <Img moduleId={moduleId} src={p.rightImg} className="match-img" /> : <span className="match-text">{p.right}</span>}
            </button>
          )
        })}
      </div>
      <p className="hint">Нажми на элемент слева, потом на подходящий справа. Пару можно поменять.</p>
    </div>
  )
}

// ---------- gap ----------
function gapWidth(spec: string) {
  if (spec.startsWith('re:')) return 18
  return Math.max(2, ...spec.split('|').map((s) => s.length)) + 1
}

export function Gap({ ex, moduleId, answers, set, marks, locked, reveal }: TypeProps<GapEx>) {
  return (
    <div className={`gap-list ${ex.inline ? 'inline' : ''}`}>
      {ex.items.map((it) => (
        <div key={it.id} className="gap-item">
          {it.img && <Img moduleId={moduleId} src={it.img} className="item-img" />}
          {it.prompt && <div className="prompt">{it.prompt}</div>}
          <div className="gap-text">
            {parseGap(it.text).map((part, i) => {
              if (part.kind === 'text') return <span key={i}>{part.text}</span>
              const key = `${it.id}.${part.index}`
              const w = gapWidth(part.spec)
              return (
                <span key={i} className="gap-wrap">
                  <input
                    className={`gap-input ${markClass(marks[key])}`}
                    style={{ width: `${Math.min(w, 28) + 1}ch` }}
                    value={String(answers[key] ?? '')}
                    onChange={(e) => set(key, e.target.value)}
                    disabled={locked(key)}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Пропуск"
                  />
                  <Expected show={reveal && marks[key] === false} text={displaySpec(part.spec)} />
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- copy ----------
export function Copy({ ex, answers, set, marks, locked, reveal }: TypeProps<CopyEx>) {
  const n = ex.times ?? 3
  return (
    <div className="copy-list">
      {ex.lines.map((l) => (
        <div key={l.id} className="copy-line">
          <span className="copy-sample">{l.sample}</span>
          <div className="copy-inputs">
            {Array.from({ length: n }, (_, k) => {
              const key = `${l.id}.${k}`
              return (
                <input
                  key={key}
                  className={`copy-input ${markClass(marks[key])}`}
                  style={{ width: `${Math.max(3, l.sample.length + 2)}ch` }}
                  value={String(answers[key] ?? '')}
                  onChange={(e) => set(key, e.target.value)}
                  disabled={locked(key)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={`${l.sample}, ${k + 1}`}
                />
              )
            })}
          </div>
          {reveal && ex.lines && Array.from({ length: n }).some((_, k) => marks[`${l.id}.${k}`] === false) && (
            <span className="expected">пиши точно как образец: {l.sample}</span>
          )}
        </div>
      ))}
      <p className="hint">Большие и маленькие буквы различаются: B и b — разные ответы.</p>
    </div>
  )
}

// ---------- order ----------
export function Order({ ex, answers, set, marks, locked }: TypeProps<OrderEx>) {
  const n = ex.items.length
  return (
    <div className="order-list">
      {ex.items.map((it) => (
        <div key={it.id} className={`order-item ${markClass(marks[it.id])}`}>
          <span className="order-label">{it.label}</span>
          <div className="chips">
            {Array.from({ length: n }, (_, i) => i + 1).map((num) => {
              const fixed = it.fixed != null
              const on = fixed ? it.fixed === num : Number(answers[it.id]) === num
              const usedBy = ex.items.find((o) => o.id !== it.id && (o.fixed === num || Number(answers[o.id]) === num))
              return (
                <button
                  key={num}
                  className={`chip num ${on ? 'on' : ''} ${usedBy && !on ? 'used' : ''}`}
                  disabled={fixed || locked(it.id)}
                  onClick={() => set(it.id, num)}
                  aria-pressed={on}
                >
                  №{num}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- sort ----------
export function Sort({ ex, answers, set, marks, locked, reveal }: TypeProps<SortEx>) {
  const words = useMemo(() => shuffle(ex.words, hash(ex.id)), [ex.id, ex.words])
  return (
    <div className="sort">
      <div className="sort-buckets">
        {ex.buckets.map((b) => (
          <div key={b.id} className="bucket">
            <div className="bucket-title">{b.label}</div>
            <div className="bucket-words">
              {ex.words
                .filter((w) => answers[w.id] === b.id)
                .map((w) => (
                  <span key={w.id} className={`tag ${markClass(marks[w.id])}`}>
                    {w.text}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sort-rows">
        {words.map((w) => (
          <div key={w.id} className={`sort-row ${markClass(marks[w.id])}`}>
            <span className="sort-word">{w.text}</span>
            <div className="chips">
              {ex.buckets.map((b) => (
                <button
                  key={b.id}
                  className={`chip ${answers[w.id] === b.id ? 'on' : ''}`}
                  disabled={locked(w.id)}
                  onClick={() => set(w.id, b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {reveal && marks[w.id] === false && <span className="expected">{ex.buckets.find((b) => b.id === w.bucket)?.label}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- word_set ----------
export function WordSet({ ex, answers, set, marks, locked, reveal }: TypeProps<WordSetEx>) {
  const [hl, setHl] = useState<Set<string>>(new Set())
  return (
    <div className="wordset">
      {ex.grid && (
        <div className="grid-wrap">
          <div className="letter-grid" style={{ gridTemplateColumns: `repeat(${ex.grid[0].split(' ').length}, minmax(0, 1fr))` }}>
            {ex.grid.flatMap((row, r) =>
              row.split(' ').map((ch, c) => {
                const k = `${r}-${c}`
                return (
                  <button
                    key={k}
                    className={`cell ${hl.has(k) ? 'on' : ''}`}
                    onClick={() =>
                      setHl((s) => {
                        const n = new Set(s)
                        if (n.has(k)) n.delete(k)
                        else n.add(k)
                        return n
                      })
                    }
                  >
                    {ch}
                  </button>
                )
              })
            )}
          </div>
          <p className="hint">Нажимай на буквы, чтобы отметить найденное слово. Слова идут слева направо или сверху вниз.</p>
        </div>
      )}
      {ex.example && <p className="hint">Пример: {ex.example}</p>}
      <div className="wordset-inputs">
        {Array.from({ length: ex.count }, (_, k) => {
          const key = `w${k}`
          return (
            <label key={key} className="ws-field">
              <span>{k + 1})</span>
              <input
                className={markClass(marks[key])}
                value={String(answers[key] ?? '')}
                onChange={(e) => set(key, e.target.value)}
                disabled={locked(key)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          )
        })}
      </div>
      {reveal && Object.values(marks).some((m) => m === false) && <p className="expected">Подходили: {ex.accept.join(', ')}</p>}
    </div>
  )
}

// ---------- free ----------
export function Free({ ex, moduleId, answers, set, locked }: TypeProps<FreeEx>) {
  return (
    <div className="free-list">
      {ex.items.map((it) => (
        <label key={it.id} className="free-item">
          {it.img && <Img moduleId={moduleId} src={it.img} className="item-img" />}
          <span className="prompt">{it.prompt}</span>
          {it.options ? (
            <select value={String(answers[it.id] ?? '')} onChange={(e) => set(it.id, e.target.value)} disabled={locked(it.id)}>
              <option value="">— выбери —</option>
              {it.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              value={String(answers[it.id] ?? '')}
              onChange={(e) => set(it.id, e.target.value)}
              disabled={locked(it.id)}
              autoCapitalize="off"
              spellCheck={false}
            />
          )}
        </label>
      ))}
    </div>
  )
}

export function TypeBody(props: TypeProps) {
  const { ex } = props
  switch (ex.type) {
    case 'listen_repeat':
      return <ListenRepeat {...(props as TypeProps<ListenRepeatEx>)} />
    case 'info':
      return <Info {...(props as TypeProps<InfoEx>)} />
    case 'choose':
      return <Choose {...(props as TypeProps<ChooseEx>)} />
    case 'match':
      return <Match {...(props as TypeProps<MatchEx>)} />
    case 'gap':
      return <Gap {...(props as TypeProps<GapEx>)} />
    case 'copy':
      return <Copy {...(props as TypeProps<CopyEx>)} />
    case 'order':
      return <Order {...(props as TypeProps<OrderEx>)} />
    case 'sort':
      return <Sort {...(props as TypeProps<SortEx>)} />
    case 'word_set':
      return <WordSet {...(props as TypeProps<WordSetEx>)} />
    case 'free':
      return <Free {...(props as TypeProps<FreeEx>)} />
  }
  return <p>Неизвестный тип упражнения.</p>
}
