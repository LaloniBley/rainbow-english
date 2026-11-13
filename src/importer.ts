import JSZip from 'jszip'
import type { Exercise, Module } from './types'

const KNOWN_TYPES = ['listen_repeat', 'info', 'choose', 'match', 'gap', 'copy', 'order', 'sort', 'word_set', 'free']

export interface ImportResult {
  module?: Module
  media: Map<string, Blob>
  errors: string[]
  warnings: string[]
}

function mime(path: string) {
  const p = path.toLowerCase()
  if (p.endsWith('.mp3')) return 'audio/mpeg'
  if (p.endsWith('.ogg')) return 'audio/ogg'
  if (p.endsWith('.wav')) return 'audio/wav'
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.webp')) return 'image/webp'
  if (p.endsWith('.svg')) return 'image/svg+xml'
  return 'image/jpeg'
}

function mediaRefs(ex: Exercise): string[] {
  const out: string[] = []
  const add = (v?: string | string[]) => {
    if (!v) return
    for (const x of Array.isArray(v) ? v : [v]) if (x !== 'tts') out.push(x)
  }
  add(ex.img)
  add(ex.images)
  add(ex.audio)
  add(ex.checkAudio)
  const anyEx = ex as unknown as { items?: { img?: string }[]; pairs?: { leftImg?: string; rightImg?: string }[] }
  anyEx.items?.forEach((i) => add(i.img))
  anyEx.pairs?.forEach((p) => {
    add(p.leftImg)
    add(p.rightImg)
  })
  return out
}

export function validateModule(m: Module, mediaPaths: Set<string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  if (!m || typeof m !== 'object') return { errors: ['module.json пустой или не объект'], warnings }
  if (!m.id) errors.push('нет поля id у модуля')
  if (typeof m.version !== 'number') errors.push('нет числового поля version у модуля')
  if (typeof m.number !== 'number') errors.push('нет числового поля number у модуля')
  if (!Array.isArray(m.steps) || m.steps.length === 0) errors.push('нет степов (steps)')
  const ids = new Set<string>()
  const checkEx = (ex: Exercise, where: string) => {
    if (!ex.id) {
      errors.push(`${where}: у упражнения нет id`)
      return
    }
    if (ids.has(ex.id)) errors.push(`${ex.id}: id повторяется`)
    ids.add(ex.id)
    if (!KNOWN_TYPES.includes(ex.type)) errors.push(`${ex.id}: неизвестный тип «${ex.type}»`)
    if (!ex.instruction) warnings.push(`${ex.id}: нет поля instruction`)
    const e = ex as unknown as Record<string, unknown>
    if (['choose', 'gap', 'free'].includes(ex.type) && !Array.isArray(e.items)) errors.push(`${ex.id}: нет поля items`)
    if (ex.type === 'match' && !Array.isArray(e.pairs)) errors.push(`${ex.id}: нет поля pairs`)
    if (ex.type === 'copy' && !Array.isArray(e.lines)) errors.push(`${ex.id}: нет поля lines`)
    if (ex.type === 'sort' && (!Array.isArray(e.buckets) || !Array.isArray(e.words))) errors.push(`${ex.id}: нет полей buckets/words`)
    if (ex.type === 'word_set' && !Array.isArray(e.accept)) errors.push(`${ex.id}: нет поля accept`)
    for (const r of mediaRefs(ex)) if (!mediaPaths.has(r)) warnings.push(`${ex.id}: нет файла ${r}`)
  }
  m.steps?.forEach((s) => {
    if (!s.id) errors.push(`степ без id`)
    s.together?.forEach((ex) => checkEx(ex, s.id))
    s.self?.forEach((ex) => checkEx(ex, s.id))
    s.vocab?.forEach((w) => {
      if (!w.id || !w.en) errors.push(`${s.id}: слово без id или en`)
      if (w.img && !mediaPaths.has(w.img)) warnings.push(`${s.id}/${w.id}: нет файла ${w.img}`)
    })
  })
  m.tests?.forEach((t) => {
    if (!t.variants?.length) errors.push(`${t.id}: у контрольной нет вариантов`)
    t.variants?.forEach((v) => v.exercises.forEach((ex) => checkEx(ex, t.id)))
  })
  return { errors, warnings }
}

export async function importModuleZip(file: File): Promise<ImportResult> {
  const media = new Map<string, Blob>()
  const res: ImportResult = { media, errors: [], warnings: [] }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    res.errors.push('Файл не похож на архив .zip. Нужен архив модуля, например module-01.zip.')
    return res
  }
  const jsonEntry = Object.values(zip.files).find((f) => !f.dir && /(^|\/)module\.json$/.test(f.name))
  if (!jsonEntry) {
    res.errors.push('В архиве нет файла module.json.')
    return res
  }
  const root = jsonEntry.name.slice(0, jsonEntry.name.length - 'module.json'.length)
  let mod: Module
  try {
    mod = JSON.parse(await jsonEntry.async('string'))
  } catch (e) {
    res.errors.push('module.json содержит ошибку JSON: ' + (e as Error).message)
    return res
  }
  for (const f of Object.values(zip.files)) {
    if (f.dir || !f.name.startsWith(root)) continue
    const rel = f.name.slice(root.length)
    if (!/^(images|audio)\//.test(rel)) continue
    const buf = await f.async('arraybuffer')
    media.set(rel, new Blob([buf], { type: mime(rel) }))
  }
  const v = validateModule(mod, new Set(media.keys()))
  res.errors.push(...v.errors)
  res.warnings.push(...v.warnings)
  if (!res.errors.length) res.module = mod
  return res
}
