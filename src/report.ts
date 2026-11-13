import type { AppConfig, DictationResult, ExResult, Module, OutboxItem, Progress, Step, TestSession } from './types'
import { exKey, sourceLabel, stepExercises, stepScore, learnedWords, wordKey, streak } from './logic'

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const min = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} мин`

function exBlock(r: ExResult, title: string): string[] {
  const lines: string[] = []
  const head = r.teacher ? `${title} — проверь сам` : `${title} — ${pct(r.scoreFirst)} с первой попытки`
  lines.push(head)
  // одинаковые поля подряд (пропись: B, B, B) сворачиваются в одну строку
  const groups: (typeof r.fields)[] = []
  for (const f of r.fields) {
    const g = groups[groups.length - 1]
    if (g && g[0].label === f.label && g[0].expected === f.expected && g[0].label === g[0].expected) g.push(f)
    else groups.push([f])
  }
  for (const g of groups) {
    if (g.length > 1) {
      const allOk = g.every((f) => f.correct && f.firstTry)
      if (allOk) {
        lines.push(`   ✓ ${g[0].label} ×${g.length}`)
        continue
      }
    }
    for (const f of g) {
      const mark =
        f.correct == null
          ? '?'
          : f.correct
            ? f.firstTry
              ? '✓'
              : '✓ (со 2-й)'
            : f.part
              ? `◐ ${Math.round(f.part * 100)}%`
              : '✗'
      const exp = f.correct === false && f.expected ? `  → верно: ${f.expected}` : ''
      lines.push(`   ${mark} ${f.label}: ${f.given || '(пусто)'}${exp}`)
    }
  }
  if (r.selfMark) lines.push(`   самопроверка по записи: ${r.selfMark === 'ok' ? 'получилось' : 'были ошибки'}`)
  return lines
}

export function stepReport(p: Progress, m: Module, s: Step, name: string): { subject: string; message: string } {
  const st = p.steps[`${m.id}/${s.id}`]
  const dict = [...p.dictations].reverse().find((d) => d.moduleId === m.id && d.stepId === s.id)
  const score = stepScore(p, m, s)
  const lines: string[] = []
  lines.push(`${name}: Step ${s.number} (${m.title}) завершён.`)
  lines.push(`Точность с первой попытки: ${pct(score)}. Время: ${min(st?.timeMs ?? 0)}.`)
  if (dict) lines.push(dictLine(dict))
  lines.push('')
  if (dict) {
    const errs = dict.words.filter((w) => !w.correct)
    if (errs.length) {
      lines.push('Ошибки в диктанте:')
      errs.forEach((w) => lines.push(`   написала «${w.typed || '—'}» → ${w.en}`))
      lines.push('')
    }
  }
  const sections: [string, typeof s.together][] = [
    ['Учимся вместе (учебник)', s.together],
    ['Учимся самостоятельно (рабочая тетрадь)', s.self]
  ]
  for (const [title, exs] of sections) {
    lines.push(`== ${title} ==`)
    for (const ex of exs) {
      const r = p.results[exKey(m, ex.id)]?.[0]
      const t = `${sourceLabel(ex.source)} [${ex.id}]`
      if (!r) {
        lines.push(`${t} — не выполнено`)
        continue
      }
      if (!r.fields.length) {
        lines.push(`${t} — выполнено${r.selfMark ? `, самопроверка: ${r.selfMark === 'ok' ? 'получилось' : 'были ошибки'}` : ''}`)
        continue
      }
      lines.push(...exBlock(r, t))
    }
    lines.push('')
  }
  return { subject: `Rainbow English: Step ${s.number} — ${pct(score)}`, message: lines.join('\n') }
}

function dictLine(d: DictationResult) {
  const ok = d.words.filter((w) => w.correct).length
  return `Диктант: ${ok}/${d.words.length} (${pct(d.score)})${d.retryScore != null ? `, пересдача ошибок: ${pct(d.retryScore)}` : ''}.`
}

export function testReport(m: Module, t: TestSession, title: string, name: string, exTitles: Record<string, string>) {
  const lines: string[] = []
  const used = (t.submittedAt ?? Date.now()) - t.startedAt
  lines.push(`${name}: ${title} — оценка ${t.grade} (${t.points}/${t.maxPoints}, ${t.percent}%).`)
  lines.push(`Вариант ${t.variant + 1}. Время: ${min(used)} из 45.${t.autoSubmitted ? ' Сдана автоматически по таймеру.' : ''}`)
  lines.push(`Уходила с вкладки: ${t.focusLost} раз.`)
  lines.push('')
  for (const r of t.results ?? []) {
    const spent = t.timePerEx[r.exId]
    lines.push(...exBlock(r, `${exTitles[r.exId] ?? r.exId}${spent ? ` (${min(spent)})` : ''}`))
    lines.push('')
  }
  return { subject: `Rainbow English: ${title} — оценка ${t.grade}`, message: lines.join('\n') }
}

export function moduleSummary(p: Progress, modules: Module[], m: Module, name: string) {
  const lines: string[] = []
  lines.push(`${name}: сводка по модулю ${m.number} «${m.title}».`)
  lines.push('')
  lines.push('Степы:')
  for (const s of m.steps) {
    const st = p.steps[`${m.id}/${s.id}`]
    lines.push(`   Step ${s.number}: ${pct(stepScore(p, m, s))}, ${min(st?.timeMs ?? 0)}`)
  }
  const dicts = p.dictations.filter((d) => d.moduleId === m.id)
  if (dicts.length) {
    lines.push('')
    lines.push('Диктанты: ' + dicts.map((d) => pct(d.score)).join(' → '))
  }
  const weak = learnedWords(p, modules)
    .filter(({ m: mm, w }) => (p.words[wordKey(mm, w)]?.errors ?? 0) > 0)
    .sort((a, b) => (p.words[wordKey(b.m, b.w)]?.errors ?? 0) - (p.words[wordKey(a.m, a.w)]?.errors ?? 0))
    .slice(0, 20)
  if (weak.length) {
    lines.push('')
    lines.push('Проблемные слова: ' + weak.map(({ m: mm, w }) => `${w.en} (${p.words[wordKey(mm, w)]?.errors})`).join(', '))
  }
  const skills: Record<string, number[]> = {}
  for (const s of m.steps)
    for (const ex of stepExercises(s)) {
      const r = p.results[exKey(m, ex.id)]?.[0]
      if (r?.scoreFirst != null) (skills[ex.skill] ??= []).push(r.scoreFirst)
    }
  lines.push('')
  lines.push('Навыки:')
  for (const [k, arr] of Object.entries(skills)) lines.push(`   ${SKILL_RU[k] ?? k}: ${pct(arr.reduce((a, b) => a + b, 0) / arr.length)}`)
  lines.push('')
  lines.push(`Серия занятий: ${streak(p)} дн. подряд.`)
  return { subject: `Rainbow English: сводка по модулю ${m.number}`, message: lines.join('\n') }
}

export const SKILL_RU: Record<string, string> = {
  listening: 'Аудирование',
  reading: 'Чтение',
  writing: 'Письмо',
  vocab: 'Лексика',
  grammar: 'Грамматика',
  speaking: 'Говорение'
}

export function makeOutbox(subject: string, message: string): OutboxItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, subject, message, createdAt: Date.now(), tries: 0 }
}

export async function sendReport(cfg: AppConfig, item: OutboxItem): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.web3formsKey) return { ok: false, error: 'нет ключа Web3Forms в config.json' }
  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: cfg.web3formsKey,
        subject: item.subject,
        from_name: 'Rainbow English',
        message: item.message
      })
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success !== false) return { ok: true }
    return { ok: false, error: data.message || `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
