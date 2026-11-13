import type { Exercise, Grading, Module, Progress, Step, TestSession, VocabWord } from './types'

export const DAY = 24 * 60 * 60 * 1000
export const DICTATION_PASS = 0.8

export interface StepRef {
  m: Module
  s: Step
  index: number
}

export function allSteps(modules: Module[]): StepRef[] {
  const out: StepRef[] = []
  let i = 0
  for (const m of [...modules].sort((a, b) => a.number - b.number))
    for (const s of [...m.steps].sort((a, b) => a.number - b.number)) out.push({ m, s, index: i++ })
  return out
}

export const stepKey = (m: Module, s: Step) => `${m.id}/${s.id}`
export const exKey = (m: Module | string, exId: string) => `${typeof m === 'string' ? m : m.id}/${exId}`
export const wordKey = (m: Module | string, w: VocabWord) => `${typeof m === 'string' ? m : m.id}/${w.id}`

export function stepExercises(s: Step): Exercise[] {
  return [...s.together, ...s.self]
}

export function exDone(p: Progress, m: Module, exId: string) {
  return (p.results[exKey(m, exId)]?.length ?? 0) > 0
}

export function stepDoneCount(p: Progress, m: Module, s: Step) {
  const all = stepExercises(s)
  return { done: all.filter((e) => exDone(p, m, e.id)).length, total: all.length }
}

export function isStepComplete(p: Progress, m: Module, s: Step) {
  const { done, total } = stepDoneCount(p, m, s)
  return total > 0 && done === total
}

export function gradeFor(percent: number, g?: Grading) {
  const gr = g ?? { five: 90, four: 75, three: 50 }
  if (percent >= gr.five) return 5
  if (percent >= gr.four) return 4
  if (percent >= gr.three) return 3
  return 2
}

export function testSessions(p: Progress, m: Module, testId: string): TestSession[] {
  return p.tests.filter((t) => t.moduleId === m.id && t.testId === testId)
}

export function bestGrade(p: Progress, m: Module, testId: string): number | null {
  const g = testSessions(p, m, testId)
    .filter((t) => t.submittedAt && t.grade != null)
    .map((t) => t.grade as number)
  return g.length ? Math.max(...g) : null
}

export function blockTest(m: Module) {
  return m.tests.find((t) => t.kind === 'block')
}

export function moduleComplete(p: Progress, m: Module) {
  return m.steps.every((s) => isStepComplete(p, m, s))
}

export function modulePassed(p: Progress, m: Module) {
  const bt = blockTest(m)
  if (!bt) return moduleComplete(p, m)
  const g = bestGrade(p, m, bt.id)
  return g != null && g >= 3
}

export function isStepUnlocked(p: Progress, modules: Module[], ref: StepRef): boolean {
  if (p.settings.authorMode) return true
  const steps = allSteps(modules)
  const i = steps.findIndex((x) => x.m.id === ref.m.id && x.s.id === ref.s.id)
  if (i <= 0) return true
  const prev = steps[i - 1]
  if (!isStepComplete(p, prev.m, prev.s)) return false
  if (prev.m.id !== ref.m.id) return modulePassed(p, prev.m)
  return true
}

export interface TestState {
  unlocked: boolean
  reason?: string
  nextAt?: number
  sessions: TestSession[]
  active?: TestSession
}

export function testState(p: Progress, m: Module, testId: string, now = Date.now()): TestState {
  const sessions = testSessions(p, m, testId)
  const active = sessions.find((s) => !s.submittedAt)
  const test = m.tests.find((t) => t.id === testId)
  if (active) return { unlocked: true, sessions, active }
  if (!p.settings.authorMode) {
    if (!moduleComplete(p, m)) return { unlocked: false, reason: 'Откроется после всех степов модуля, включая Summing Up.', sessions }
    if (test && test.kind !== 'block') {
      const bt = blockTest(m)
      if (bt && !testSessions(p, m, bt.id).some((s) => s.submittedAt))
        return { unlocked: false, reason: 'Откроется после контрольной модуля.', sessions }
    }
  }
  const last = sessions.filter((s) => s.submittedAt).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0]
  if (last && !p.settings.authorMode) {
    const nextAt = (last.submittedAt ?? 0) + DAY
    if (now < nextAt) return { unlocked: false, reason: 'Пересдать можно через сутки после прошлой попытки.', nextAt, sessions }
  }
  return { unlocked: true, sessions }
}

export function pickVariant(p: Progress, m: Module, testId: string, count: number) {
  const used = testSessions(p, m, testId).map((s) => s.variant)
  const fresh = [...Array(count).keys()].filter((i) => !used.includes(i))
  const pool = fresh.length ? fresh : [...Array(count).keys()].filter((i) => i !== used[used.length - 1])
  const list = pool.length ? pool : [0]
  return list[Math.floor(Math.random() * list.length)]
}

// ---------- Диктант ----------

export interface DictItem {
  key: string
  word: VocabWord
  moduleId: string
  mode: 'write' | 'choose'
}

export function previousStep(modules: Module[], m: Module, s: Step): StepRef | undefined {
  const steps = allSteps(modules)
  const i = steps.findIndex((x) => x.m.id === m.id && x.s.id === s.id)
  return i > 0 ? steps[i - 1] : undefined
}

export function learnedWords(p: Progress, modules: Module[]): { m: Module; s: Step; w: VocabWord }[] {
  const out: { m: Module; s: Step; w: VocabWord }[] = []
  const seen = new Set<string>()
  for (const { m, s } of allSteps(modules)) {
    const st = p.steps[stepKey(m, s)]
    if (st?.completedAt || isStepComplete(p, m, s))
      s.vocab.forEach((w) => {
        const k = wordKey(m, w)
        if (seen.has(k)) return
        seen.add(k)
        out.push({ m, s, w })
      })
  }
  return out
}

export function dictationFor(p: Progress, modules: Module[], m: Module, s: Step): DictItem[] {
  const prev = previousStep(modules, m, s)
  if (!prev) return []
  const items: DictItem[] = []
  const seen = new Set<string>()
  const push = (mm: Module, st: Step, w: VocabWord) => {
    const key = wordKey(mm, w)
    if (seen.has(key)) return
    seen.add(key)
    items.push({ key, word: w, moduleId: mm.id, mode: st.dictationMode ?? 'write' })
  }
  if (s.summingUp) {
    const all = m.steps.filter((x) => x.number < s.number).flatMap((x) => x.vocab.map((w) => ({ st: x, w })))
    const weighted = all.sort((a, b) => (p.words[wordKey(m, a.w)]?.box ?? 1) - (p.words[wordKey(m, b.w)]?.box ?? 1))
    weighted.slice(0, 30).forEach(({ st, w }) => push(m, st, w))
    return items
  }
  prev.s.vocab.forEach((w) => push(prev.m, prev.s, w))
  if (items.length === 0) {
    learnedWords(p, modules)
      .slice(-40)
      .sort(() => Math.random() - 0.5)
      .slice(0, 12)
      .forEach(({ m: mm, s: st, w }) => push(mm, st, w))
  }
  // слова с ошибками из прошлых диктантов (коробки 1–2), не больше 5
  const weak = learnedWords(p, modules)
    .filter(({ m: mm, w }) => {
      const ws = p.words[wordKey(mm, w)]
      return ws && ws.box <= 2 && ws.errors > 0
    })
    .slice(0, 5)
  weak.forEach(({ m: mm, s: st, w }) => push(mm, st, w))
  return items
}

export function needsDictation(p: Progress, modules: Module[], m: Module, s: Step) {
  const st = p.steps[stepKey(m, s)]
  if (st?.dictationDone) return false
  return dictationFor(p, modules, m, s).length > 0
}

export function updateWord(p: Progress, key: string, correct: boolean) {
  const ws = p.words[key] ?? { box: 1, seen: 0, errors: 0, lastSeen: 0 }
  ws.seen += 1
  ws.lastSeen = Date.now()
  if (correct) ws.box = Math.min(5, ws.box + 1)
  else {
    ws.box = 1
    ws.errors += 1
  }
  p.words[key] = ws
}

export function dateKey(t = Date.now()) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function streak(p: Progress) {
  let n = 0
  const d = new Date()
  // сегодняшний день не обрывает серию, если ещё не занималась
  if (!p.activity[dateKey(d.getTime())]) d.setDate(d.getDate() - 1)
  while (p.activity[dateKey(d.getTime())]) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function stars(score: number | null) {
  if (score == null) return 0
  if (score >= 0.9) return 3
  if (score >= 0.7) return 2
  return 1
}

export function stepScore(p: Progress, m: Module, s: Step): number | null {
  const scores = stepExercises(s)
    .map((e) => p.results[exKey(m, e.id)]?.[0]?.scoreFirst)
    .filter((x): x is number => typeof x === 'number')
  if (!scores.length) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

export function sourceLabel(src?: { book: string; page?: number; ex?: string | number }) {
  if (!src) return ''
  const book = src.book === 'wb' ? 'Рабочая тетрадь' : src.book === 'test' ? 'Контрольная' : src.book === 'sb2' ? 'Учебник, ч. 2' : 'Учебник, ч. 1'
  return [book, src.ex != null ? `упр. ${src.ex}` : '', src.page ? `стр. ${src.page}` : ''].filter(Boolean).join(', ')
}
