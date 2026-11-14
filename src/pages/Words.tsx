import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { learnedWords, wordKey, updateWord } from '../logic'
import { Img, Speak } from '../components/media'
import { shuffle } from '../check'
import { speak } from '../tts'
import type { Module, VocabWord } from '../types'

type W = { m: Module; w: VocabWord; key: string; box: number }

function Flashcards({ words, onRate }: { words: W[]; onRate: (key: string, ok: boolean) => void }) {
  // колода тасуется один раз: оценка карточки меняет прогресс, и без этого колода перемешивалась бы заново
  const [deck, setDeck] = useState(() => shuffle(words, Date.now() % 9999).slice(0, 15))
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  if (!deck.length) return null
  if (i >= deck.length)
    return (
      <div className="game-end">
        <p>Колода пройдена: {deck.length} {deck.length < 5 ? 'карточки' : 'карточек'}.</p>
        <button className="primary" onClick={() => { setDeck(shuffle(words, Date.now() % 9999).slice(0, 15)); setI(0); setOpen(false) }}>Ещё раз</button>
      </div>
    )
  const c = deck[i]
  return (
    <div className="flash">
      <div className="flash-progress">{i + 1} / {deck.length}</div>
      <button className={`flash-card ${open ? 'open' : ''}`} onClick={() => { setOpen(true); speak(c.w.en) }}>
        {!open ? (
          <>
            {c.w.img ? <Img moduleId={c.m.id} src={c.w.img} className="flash-img" /> : null}
            <span className="flash-front">{c.w.ru ?? (c.w.name ? 'Имя: нажми, чтобы услышать и увидеть' : 'Нажми, чтобы открыть')}</span>
          </>
        ) : (
          <>
            <span className="flash-en">{c.w.en}</span>
            {c.w.tr && <span className="flash-tr">{c.w.tr}</span>}
            {c.w.ru && <span className="flash-ru">{c.w.ru}</span>}
          </>
        )}
      </button>
      {open && (
        <div className="row center">
          <button className="ghost" onClick={() => { onRate(c.key, false); setI(i + 1); setOpen(false) }}>Ещё повторить</button>
          <button className="primary" onClick={() => { onRate(c.key, true); setI(i + 1); setOpen(false) }}>Знаю</button>
        </div>
      )}
    </div>
  )
}

function Pairs({ words }: { words: W[] }) {
  const candidates = words.filter((x) => x.w.img || (x.w.ru && !x.w.name))
  const [seed, setSeed] = useState(1)
  const set = useMemo(() => shuffle(candidates, seed * 7919 + Date.now() % 997).slice(0, 6), [seed, candidates.length]) // eslint-disable-line
  const right = useMemo(() => shuffle(set, seed + 3), [set, seed])
  const [sel, setSel] = useState<string | null>(null)
  const [found, setFound] = useState<Set<string>>(new Set())
  const [miss, setMiss] = useState<string | null>(null)
  const [t0] = useState(Date.now())
  if (candidates.length < 3) return <p className="muted">Игра откроется, когда в словарике будет хотя бы три слова с картинкой или переводом.</p>
  const done = found.size === set.length
  return (
    <div className="pairs">
      <div className="pairs-cols">
        <div>
          {set.map((x) => (
            <button key={x.key} className={`pair-cell ${sel === x.key ? 'active' : ''} ${found.has(x.key) ? 'found' : ''}`} disabled={found.has(x.key)} onClick={() => { setSel(x.key); speak(x.w.en) }}>
              {x.w.en}
            </button>
          ))}
        </div>
        <div>
          {right.map((x) => (
            <button
              key={x.key}
              className={`pair-cell ${found.has(x.key) ? 'found' : ''} ${miss === x.key ? 'miss' : ''}`}
              disabled={found.has(x.key) || !sel}
              onClick={() => {
                if (sel === x.key) {
                  setFound(new Set([...found, x.key]))
                  setSel(null)
                } else {
                  setMiss(x.key)
                  setTimeout(() => setMiss(null), 500)
                }
              }}
            >
              {x.w.img ? <Img moduleId={x.m.id} src={x.w.img} className="pair-img" /> : x.w.ru}
            </button>
          ))}
        </div>
      </div>
      {done && (
        <div className="game-end">
          <p>Все пары за {Math.round((Date.now() - t0) / 1000)} с.</p>
          <button className="primary" onClick={() => { setSeed(seed + 1); setFound(new Set()) }}>Новый раунд</button>
        </div>
      )}
    </div>
  )
}

export default function Words() {
  const { modules, progress, update } = useStore()
  const [mode, setMode] = useState<'list' | 'cards' | 'pairs'>('list')
  const words: W[] = learnedWords(progress, modules).map(({ m, w }) => ({ m, w, key: wordKey(m, w), box: progress.words[wordKey(m, w)]?.box ?? 0 }))
  const byStep = learnedWords(progress, modules).reduce<Record<string, { title: string; items: W[] }>>((acc, { m, s, w }) => {
    const k = `${m.id}/${s.id}`
    ;(acc[k] ??= { title: `Step ${s.number}`, items: [] }).items.push({ m, w, key: wordKey(m, w), box: progress.words[wordKey(m, w)]?.box ?? 0 })
    return acc
  }, {})

  return (
    <div className="page words-page">
      <h1>Словарик</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'list'} className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>Все слова</button>
        <button role="tab" aria-selected={mode === 'cards'} className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>Карточки</button>
        <button role="tab" aria-selected={mode === 'pairs'} className={mode === 'pairs' ? 'on' : ''} onClick={() => setMode('pairs')}>Пары на время</button>
      </div>
      {!words.length && <p className="muted">Слова появятся здесь после первого пройденного степа.</p>}
      {mode === 'list' &&
        Object.entries(byStep).map(([k, g]) => (
          <section key={k} className="word-group">
            <h2>{g.title}</h2>
            <div className="word-grid">
              {g.items.map((x) => (
                <div key={x.key} className="word-card">
                  {x.w.img && <Img moduleId={x.m.id} src={x.w.img} className="wc-img" />}
                  <div className="wc-en">{x.w.en}</div>
                  {x.w.tr && <div className="wc-tr">{x.w.tr}</div>}
                  {x.w.ru && <div className="wc-ru">{x.w.ru}</div>}
                  <div className="wc-foot">
                    <Speak text={x.w.en} />
                    <span className="boxes" title={x.box ? `Знание: ${x.box} из 5` : 'Ещё не было в диктанте'}>
                      {[1, 2, 3, 4, 5].map((b) => (
                        <i key={b} className={b <= x.box ? 'on' : ''} />
                      ))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      {mode === 'cards' && <Flashcards words={words} onRate={(key, ok) => update((p) => updateWord(p, key, ok))} />}
      {mode === 'pairs' && <Pairs words={words} />}
    </div>
  )
}
