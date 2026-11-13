import { useEffect, useState } from 'react'
import { getMedia } from './db'

const cache = new Map<string, string>()

export async function mediaUrl(moduleId: string, path: string): Promise<string | undefined> {
  const key = `${moduleId}/${path}`
  if (cache.has(key)) return cache.get(key)
  const blob = await getMedia(moduleId, path)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  cache.set(key, url)
  return url
}

export function clearMediaCache(moduleId: string) {
  for (const [k, url] of cache) {
    if (k.startsWith(moduleId + '/')) {
      URL.revokeObjectURL(url)
      cache.delete(k)
    }
  }
}

export function useMedia(moduleId: string, path?: string) {
  const [url, setUrl] = useState<string | undefined>(() => (path ? cache.get(`${moduleId}/${path}`) : undefined))
  useEffect(() => {
    let alive = true
    if (!path || path === 'tts') {
      setUrl(undefined)
      return
    }
    mediaUrl(moduleId, path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [moduleId, path])
  return url
}
