#!/usr/bin/env node
// Проверяет папку модуля и упаковывает её в архив для импорта.
// Использование: npm run pack-module -- modules/module-02
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

const dir = process.argv[2]
if (!dir) {
  console.error('Укажи папку модуля: npm run pack-module -- modules/module-02')
  process.exit(1)
}
const jsonPath = path.join(dir, 'module.json')
if (!fs.existsSync(jsonPath)) {
  console.error(`Нет файла ${jsonPath}`)
  process.exit(1)
}

let mod
try {
  mod = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
} catch (e) {
  console.error('Ошибка в module.json:', e.message)
  process.exit(1)
}

const TYPES = ['listen_repeat', 'info', 'choose', 'match', 'gap', 'copy', 'order', 'sort', 'word_set', 'free']
const errors = []
const warnings = []
const ids = new Set()
const exists = (p) => fs.existsSync(path.join(dir, p))
const refs = (ex) => {
  const out = []
  const add = (v) => v && (Array.isArray(v) ? v : [v]).forEach((x) => x !== 'tts' && out.push(x))
  add(ex.img); add(ex.images); add(ex.audio); add(ex.checkAudio)
  ex.items?.forEach((i) => add(i.img))
  ex.pairs?.forEach((p) => { add(p.leftImg); add(p.rightImg) })
  return out
}
const checkEx = (ex, where) => {
  if (!ex.id) return errors.push(`${where}: упражнение без id`)
  if (ids.has(ex.id)) errors.push(`${ex.id}: id повторяется`)
  ids.add(ex.id)
  if (!TYPES.includes(ex.type)) errors.push(`${ex.id}: неизвестный тип "${ex.type}"`)
  if (!ex.instruction) warnings.push(`${ex.id}: нет instruction`)
  if (['choose', 'gap', 'free'].includes(ex.type) && !Array.isArray(ex.items)) errors.push(`${ex.id}: нет items`)
  if (ex.type === 'gap') ex.items?.forEach((it) => { if (!/\{[^}]+\}/.test(it.text) && !/—/.test(it.text)) warnings.push(`${ex.id}/${it.id}: нет пропуска {…}`) })
  if (ex.type === 'match' && !Array.isArray(ex.pairs)) errors.push(`${ex.id}: нет pairs`)
  if (ex.type === 'copy' && !Array.isArray(ex.lines)) errors.push(`${ex.id}: нет lines`)
  if (ex.type === 'choose') ex.items?.forEach((it) => it.answer?.forEach((a) => { if (!it.options.includes(a)) errors.push(`${ex.id}/${it.id}: ответ "${a}" не входит в options`) }))
  for (const r of refs(ex)) if (!exists(r)) errors.push(`${ex.id}: нет файла ${r}`)
}
if (!mod.id) errors.push('нет id модуля')
if (typeof mod.version !== 'number') errors.push('нет числового version')
if (typeof mod.number !== 'number') errors.push('нет числового number')
for (const s of mod.steps ?? []) {
  s.together?.forEach((e) => checkEx(e, s.id))
  s.self?.forEach((e) => checkEx(e, s.id))
  s.vocab?.forEach((w) => w.img && !exists(w.img) && errors.push(`${s.id}/${w.id}: нет файла ${w.img}`))
}
for (const t of mod.tests ?? []) t.variants?.forEach((v) => v.exercises.forEach((e) => checkEx(e, t.id)))

warnings.forEach((w) => console.warn('предупреждение:', w))
if (errors.length) {
  errors.forEach((e) => console.error('ошибка:', e))
  console.error(`\nМодуль не упакован: ${errors.length} ошибок.`)
  process.exit(1)
}

const zip = new JSZip()
const walk = (rel) => {
  for (const name of fs.readdirSync(path.join(dir, rel))) {
    const r = path.join(rel, name)
    const full = path.join(dir, r)
    if (fs.statSync(full).isDirectory()) walk(r)
    else if (r === 'module.json' || /^(images|audio)[\\/]/.test(r)) zip.file(r.split(path.sep).join('/'), fs.readFileSync(full))
  }
}
walk('')
const out = path.join(path.dirname(path.resolve(dir)), `${mod.id}.zip`)
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
fs.writeFileSync(out, buf)
const ex = (mod.steps ?? []).reduce((a, s) => a + (s.together?.length ?? 0) + (s.self?.length ?? 0), 0)
console.log(`Готово: ${out} (${(buf.length / 1048576).toFixed(1)} МБ), степов ${mod.steps.length}, упражнений ${ex}, версия ${mod.version}.`)
