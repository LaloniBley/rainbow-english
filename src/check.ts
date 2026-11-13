export function norm(s: string, caseSensitive = false) {
  let t = (s ?? '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  t = t.replace(/[.!?]+$/g, '').trim()
  return caseSensitive ? t : t.toLowerCase()
}

/** ответ: "a|b|c" или "re:..." */
export function matches(given: string, spec: string, caseSensitive = false): boolean {
  const g = (given ?? '').trim()
  if (!g) return false
  if (spec.startsWith('re:')) {
    try {
      return new RegExp(spec.slice(3), 'i').test(norm(g, false))
    } catch {
      return false
    }
  }
  return spec.split('|').some((alt) => norm(alt, caseSensitive) === norm(g, caseSensitive))
}

/** показать ожидаемый ответ человеку */
export function displaySpec(spec: string): string {
  if (spec.startsWith('re:')) return 'свободный ответ по образцу'
  return spec.split('|')[0]
}

export type GapPart = { kind: 'text'; text: string } | { kind: 'gap'; spec: string; index: number }

export function parseGap(text: string): GapPart[] {
  const parts: GapPart[] = []
  const re = /\{([^}]*)\}/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) })
    parts.push({ kind: 'gap', spec: m[1], index: i++ })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = seed || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h) || 1
}
