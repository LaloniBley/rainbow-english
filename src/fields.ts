import { displaySpec, matches, parseGap, norm } from './check'
import type { Exercise } from './types'

export type Answers = Record<string, unknown>

export interface FieldDef {
  key: string
  label: string
  expected?: string
  /** true/false — проверено; null — без ключа */
  check: (a: Answers) => boolean | null
  /** частичный зачёт 0..1; если нет — считается по check */
  credit?: (a: Answers) => number
  given: (a: Answers) => string
  required: boolean
}

const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? (v as string[]).join(', ') : v == null ? '' : String(v))

export function fieldsFor(ex: Exercise): FieldDef[] {
  const teacher = !!ex.teacher
  switch (ex.type) {
    case 'listen_repeat':
    case 'info':
      return []
    case 'choose':
      return ex.items.map((it, i) => ({
        key: it.id,
        label: it.prompt ?? (ex.items.length > 1 ? `${i + 1}` : 'Ответ'),
        expected: it.answer && !teacher && !ex.free ? it.answer.join(', ') : undefined,
        required: true,
        given: (a) => str(a[it.id]),
        credit:
          it.multi && it.answer && !teacher && !ex.free
            ? (a) => {
                const sel = Array.isArray(a[it.id]) ? (a[it.id] as string[]) : []
                const hits = sel.filter((x) => it.answer!.includes(x)).length
                const wrong = sel.length - hits
                // каждый верный выбор — доля балла, каждый лишний её отнимает
                return Math.max(0, hits - wrong) / it.answer!.length
              }
            : undefined,
        check: (a) => {
          const v = a[it.id]
          if (teacher || ex.free || !it.answer) return null
          if (it.multi) {
            const set = new Set(Array.isArray(v) ? (v as string[]) : [])
            return set.size === it.answer.length && it.answer.every((x) => set.has(x))
          }
          return it.answer.includes(String(v ?? ''))
        }
      }))
    case 'match':
      return ex.pairs.map((p) => ({
        key: p.id,
        label: p.left,
        expected: teacher ? undefined : p.right,
        required: true,
        given: (a) => {
          const id = a[p.id]
          return ex.pairs.find((q) => q.id === id)?.right ?? ''
        },
        check: (a) => (teacher ? null : a[p.id] === p.id)
      }))
    case 'gap': {
      const out: FieldDef[] = []
      ex.items.forEach((it) => {
        parseGap(it.text).forEach((part) => {
          if (part.kind !== 'gap') return
          const key = `${it.id}.${part.index}`
          const label = it.prompt || it.text.replace(/\{[^}]*\}/g, '…').trim()
          out.push({
            key,
            label,
            expected: teacher ? undefined : displaySpec(part.spec),
            required: true,
            given: (a) => str(a[key]),
            check: (a) => (teacher ? null : matches(str(a[key]), part.spec, !!ex.caseSensitive))
          })
        })
      })
      return out
    }
    case 'copy': {
      const n = ex.times ?? 3
      const out: FieldDef[] = []
      ex.lines.forEach((l) => {
        for (let k = 0; k < n; k++) {
          const key = `${l.id}.${k}`
          out.push({
            key,
            label: l.sample,
            expected: l.sample,
            required: true,
            given: (a) => str(a[key]),
            check: (a) => str(a[key]).trim() === l.sample
          })
        }
      })
      return out
    }
    case 'order':
      return ex.items
        .filter((it) => it.fixed == null)
        .map((it) => {
          const pos = ex.answer ? ex.answer.indexOf(it.id) + 1 : 0
          return {
            key: it.id,
            label: it.label,
            expected: !teacher && pos ? `№${pos}` : undefined,
            required: true,
            given: (a) => (a[it.id] ? `№${a[it.id]}` : ''),
            check: (a) => (teacher || !ex.answer ? null : Number(a[it.id]) === pos)
          }
        })
    case 'sort':
      return ex.words.map((w) => ({
        key: w.id,
        label: w.text,
        expected: teacher ? undefined : ex.buckets.find((b) => b.id === w.bucket)?.label,
        required: true,
        given: (a) => ex.buckets.find((b) => b.id === a[w.id])?.label ?? '',
        check: (a) => (teacher ? null : a[w.id] === w.bucket)
      }))
    case 'word_set': {
      const out: FieldDef[] = []
      const accept = ex.accept.map((x) => norm(x))
      for (let k = 0; k < ex.count; k++) {
        const key = `w${k}`
        out.push({
          key,
          label: `слово ${k + 1}`,
          expected: undefined,
          required: true,
          given: (a) => str(a[key]),
          check: (a) => {
            const v = norm(str(a[key]))
            if (!v || !accept.includes(v)) return false
            // без повторов: засчитывается первое вхождение
            for (let j = 0; j < k; j++) if (norm(str(a[`w${j}`])) === v) return false
            return true
          }
        })
      }
      return out
    }
    case 'free':
      return ex.items.map((it) => ({
        key: it.id,
        label: it.prompt,
        required: true,
        given: (a) => str(a[it.id]),
        check: () => null
      }))
  }
  return []
}

export function isFilled(f: FieldDef, a: Answers) {
  return f.given(a).trim().length > 0
}

/** доля баллов по полям с ключом */
export function scoreFields(fr: FieldResultLike[], first: boolean): number | null {
  const scored = fr.filter((f) => f.correct !== null)
  if (!scored.length) return null
  const sum = scored.reduce((acc, f) => acc + (first ? f.partFirst ?? (f.firstTry ? 1 : 0) : f.part ?? (f.correct ? 1 : 0)), 0)
  return sum / scored.length
}
type FieldResultLike = { correct: boolean | null; firstTry: boolean | null; part?: number; partFirst?: number }
