import { useEffect, useMemo, useRef, useState } from 'react'
import type { DictationResult, DictationWord, Module } from '../types'
import { DICTATION_PASS, type DictItem } from '../logic'
import { hash, norm, shuffle } from '../check'
import { speak } from '../tts'
import { Img, Speak } from '../components/media'
import { mediaUrl } from '../media'

type Kind = DictationWord['kind']

function kindsFor(it: DictItem): Kind[] {
  if (it.mode === 'choose') return ['choose']
  const k: Kind[] = ['audio']
  if (it.word.img) k.push('picture')
  if (it.word.ru) k.push('ru')
  return k
}

async function sayWord(it: DictItem) {
  if (it.word.audio) {
    const url = await mediaUrl(it.moduleId, it.word.audio)
    if (url) {
      new Audio(url).play()
      return
    }
  }
  speak(it.word.en, 0.8)
}

function Diff({ typed, en }: { typed: string; en: string }) {
  const t = typed.trim()
  return (
    <span className="diff">
      {Array.from(t || '—').map((ch, i) => (
        <span key={i} className={ch.toLowerCase() === (en[i] ?? '').toLowerCase() ? '' : 'diff-bad'}>
          {ch}
        </span>
      ))}
    </span>
  )
}

function Round({
  items,
  pool,
  onDone
}: {
  items: DictItem[]
  pool: DictItem[]
  onDone: (words: DictationWord[]) => void
}) {
  const [i, setI] = useState(0)
  const [val, setVal] = useState('')
  const [plays, setPlays] = useState(0)
  const results = useRef<DictationWord[]>([])
  const input = useRef<HTMLInputElement>(null)
  const it = items[i]
  const kind = useMemo(() => {
    const ks = kindsFor(it)
    return ks[hash(it.key + i) % ks.length]
  }, [it, i])
  const options = useMemo(() => {
    if (kind !== 'choose') return []
    const others = shuffle(
      pool.filter((p) => p.key !== it.key).map((p) => p.word.en),
      hash(it.key)
    ).filter((v, k, a) => a.indexOf(v) === k)
    return shuffle([it.word.en, ...others.slice(0, 5)], hash(it.key + 'o'))
  }, [kind, it, pool])

  useEffect(() => {
    setVal('')
    setPlays(0)
    if (kind === 'audio' || kind === 'choose') {
      const t = setTimeout(() => {
        sayWord(it)
        setPlays(1)
      }, 350)
      return () => clearTimeout(t)
    }
  }, [i, kind, it])

  useEffect(() => {
    input.current?.focus()
  }, [i])

  const next = (typed: string) => {
    const correct = norm(typed) === norm(it.word.en)
    results.current.push({ wordKey: it.key, en: it.word.en, kind, typed, correct })
    if (i + 1 < items.length) setI(i + 1)
    else onDone(results.current)
  }

  return (
    <div className="dict-card">
      <div className="dict-progress">
        Слово {i + 1} из {items.length}
        <div className="bar">
          <i style={{ width: `${(i / items.length) * 100}%` }} />
        </div>
      </div>
      <div className="dict-prompt">
        {(kind === 'audio' || kind === 'choose') && (
          <button
            className="listen-big"
            disabled={plays >= 2}
            onClick={() => {
              sayWord(it)
              setPlays((p) => p + 1)
            }}
          >
            <svg viewBox="0 0 24 24" width="34" height="34">
              <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
              <path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
            <span>{plays >= 2 ? 'Больше прослушать нельзя' : `Послушать ещё раз (${2 - plays})`}</span>
          </button>
        )}
        {kind === 'picture' && <Img moduleId={it.moduleId} src={it.word.img} className="dict-img" />}
        {kind === 'ru' && <div className="dict-ru">{it.word.ru}</div>}
      </div>
      {kind === 'choose' ? (
        <div className="chips center">
          {options.map((o) => (
            <button key={o} className="chip big" onClick={() => next(o)}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <form
          className="dict-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (val.trim()) next(val)
          }}
        >
          <input
            ref={input}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={kind === 'picture' ? 'Что на картинке?' : kind === 'ru' ? 'Напиши по-английски' : 'Напиши, что услышала'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Ответ"
          />
          <button className="primary" disabled={!val.trim()}>
            Дальше
          </button>
        </form>
      )}
    </div>
  )
}

export default function Dictation({
  items,
  module,
  stepId,
  onFinish
}: {
  items: DictItem[]
  module: Module
  stepId: string
  onFinish: (r: DictationResult) => void
}) {
  const [stage, setStage] = useState<'intro' | 'round' | 'result' | 'review' | 'retry' | 'final'>('intro')
  const [first, setFirst] = useState<DictationWord[]>([])
  const [second, setSecond] = useState<DictationWord[]>([])
  const order = useMemo(() => shuffle(items, Date.now() % 100000), [items])
  const wrongItems = useMemo(() => order.filter((it) => first.find((w) => w.wordKey === it.key && !w.correct)), [first, order])
  const score = first.length ? first.filter((w) => w.correct).length / first.length : 0
  const isSumming = module.steps.find((s) => s.id === stepId)?.summingUp

  const finish = (retry?: DictationWord[]) => {
    onFinish({
      id: `${Date.now()}`,
      moduleId: module.id,
      stepId,
      date: Date.now(),
      words: first,
      score,
      retryScore: retry ? retry.filter((w) => w.correct).length / retry.length : undefined
    })
  }

  if (stage === 'intro')
    return (
      <section className="dictation">
        <h2>{isSumming ? 'Большой диктант по модулю' : 'Диктант-разминка'}</h2>
        <p>
          {items.length} {items.length < 5 ? 'слова' : 'слов'}. {items[0]?.mode === 'choose' ? 'Послушай слово и выбери, как оно пишется.' : 'Слово звучит, показывается картинкой или переводом — напиши его по-английски.'}{' '}
          Каждое слово можно прослушать два раза. Подсказок нет, ответы проверяются в конце.
        </p>
        <p className="muted">Чтобы перейти дальше, нужно 80% верных ответов. Если не получится — повторим ошибки и попробуем ещё раз.</p>
        <button className="primary big" onClick={() => setStage('round')}>
          Начать диктант
        </button>
      </section>
    )

  if (stage === 'round')
    return (
      <section className="dictation">
        <Round
          items={order}
          pool={items}
          onDone={(w) => {
            setFirst(w)
            setStage('result')
          }}
        />
      </section>
    )

  if (stage === 'retry')
    return (
      <section className="dictation">
        <h2>Пересдача ошибок</h2>
        <Round
          items={wrongItems}
          pool={items}
          onDone={(w) => {
            setSecond(w)
            setStage('final')
          }}
        />
      </section>
    )

  if (stage === 'review')
    return (
      <section className="dictation">
        <h2>Повтори эти слова</h2>
        <p className="muted">Посмотри, послушай и проговори каждое слово. Потом напишешь их ещё раз.</p>
        <div className="review-cards">
          {wrongItems.map((it) => (
            <div key={it.key} className="review-card">
              {it.word.img && <Img moduleId={it.moduleId} src={it.word.img} className="rc-img" />}
              <div className="rc-en">{it.word.en}</div>
              {it.word.tr && <div className="rc-tr">{it.word.tr}</div>}
              {it.word.ru && <div className="rc-ru">{it.word.ru}</div>}
              <Speak text={it.word.en} label="Послушать" />
            </div>
          ))}
        </div>
        <button className="primary big" onClick={() => setStage('retry')}>
          Написать ещё раз
        </button>
      </section>
    )

  const list = stage === 'final' ? second : first
  const pass = score >= DICTATION_PASS
  const retryScore = second.length ? second.filter((w) => w.correct).length / second.length : 0

  return (
    <section className="dictation">
      <h2>
        {stage === 'final' ? `Пересдача: ${Math.round(retryScore * 100)}%` : `Результат: ${first.filter((w) => w.correct).length} из ${first.length}`}
      </h2>
      <ul className="dict-results">
        {list.map((w) => (
          <li key={w.wordKey} className={w.correct ? 'ok' : 'bad'}>
            <span className="dr-mark">{w.correct ? '✓' : '✗'}</span>
            {w.correct ? <span>{w.en}</span> : <><Diff typed={w.typed} en={w.en} /> <span className="dr-arrow">→</span> <b>{w.en}</b></>}
          </li>
        ))}
      </ul>
      {stage === 'result' && !pass ? (
        <>
          <p>Меньше 80%. Повторим ошибочные слова и напишем их ещё раз.</p>
          <button className="primary big" onClick={() => setStage('review')}>
            Повторить слова
          </button>
        </>
      ) : (
        <button className="primary big" onClick={() => finish(stage === 'final' ? second : undefined)}>
          К заданиям степа
        </button>
      )}
    </section>
  )
}
