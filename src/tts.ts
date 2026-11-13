let voice: SpeechSynthesisVoice | null = null

function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() ?? []
  voice =
    vs.find((v) => v.lang === 'en-GB' && /natural|online/i.test(v.name)) ||
    vs.find((v) => v.lang === 'en-GB') ||
    vs.find((v) => v.lang.startsWith('en')) ||
    null
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

export function ttsAvailable() {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

export function speak(text: string, rate = 0.85) {
  if (!ttsAvailable()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (!voice) pickVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'en-GB'
  u.rate = rate
  window.speechSynthesis.speak(u)
}
