import { useEffect, useRef, useState } from 'react'
import { useMedia } from '../media'
import { speak } from '../tts'

export function Img({ moduleId, src, alt = '', className }: { moduleId: string; src?: string; alt?: string; className?: string }) {
  const url = useMedia(moduleId, src)
  if (!src) return null
  if (!url) return <div className={`img-ph ${className ?? ''}`} />
  return <img src={url} alt={alt} className={className} loading="lazy" draggable={false} />
}

function fmt(t: number) {
  if (!isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({
  moduleId,
  src,
  label,
  onPlay,
  compact
}: {
  moduleId: string
  src: string
  label?: string
  onPlay?: () => void
  compact?: boolean
}) {
  const url = useMedia(moduleId, src)
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = slow ? 0.75 : 1
  }, [slow, url])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) {
      document.querySelectorAll('audio').forEach((x) => x !== a && x.pause())
      a.play()
      if (a.currentTime < 0.3) onPlay?.()
    } else a.pause()
  }

  return (
    <div className={`player ${compact ? 'player-compact' : ''} ${playing ? 'is-playing' : ''}`}>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
      />
      <button className="play" onClick={toggle} disabled={!url} aria-label={playing ? 'Пауза' : 'Слушать'}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
        )}
      </button>
      <div className="player-mid">
        {label && <div className="player-label">{label}</div>}
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={t}
          onChange={(e) => {
            if (ref.current) ref.current.currentTime = Number(e.target.value)
          }}
          aria-label="Позиция"
        />
      </div>
      <span className="player-time">
        {fmt(t)} / {fmt(dur)}
      </span>
      {!compact && (
        <>
          <button
            className="ghost small"
            onClick={() => {
              if (ref.current) ref.current.currentTime = Math.max(0, ref.current.currentTime - 5)
            }}
            title="Назад на 5 секунд"
          >
            −5 с
          </button>
          <button className={`ghost small ${slow ? 'on' : ''}`} onClick={() => setSlow((s) => !s)} title="Медленнее">
            0,75×
          </button>
        </>
      )}
    </div>
  )
}

export function Speak({ text, label }: { text: string; label?: string }) {
  return (
    <button className="speak" onClick={() => speak(text)} title="Озвучить" aria-label={`Озвучить ${text}`}>
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        <path d="M16 8.5a4.5 4.5 0 0 1 0 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      {label && <span>{label}</span>}
    </button>
  )
}

export function AudioList({ moduleId, audio, onPlay, label }: { moduleId: string; audio?: string | string[]; onPlay?: () => void; label?: string }) {
  if (!audio) return null
  const list = (Array.isArray(audio) ? audio : [audio]).filter((a) => a !== 'tts')
  return (
    <div className="audio-list">
      {list.map((a, i) => (
        <AudioPlayer key={a} moduleId={moduleId} src={a} onPlay={onPlay} label={list.length > 1 ? `${label ?? 'Запись'} ${i + 1}` : label} />
      ))}
    </div>
  )
}
