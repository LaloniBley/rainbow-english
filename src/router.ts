import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'step'; moduleId: string; stepId: string }
  | { name: 'test'; moduleId: string; testId: string }
  | { name: 'words' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'help' }

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  switch (parts[0]) {
    case 'step':
      return { name: 'step', moduleId: parts[1], stepId: parts[2] }
    case 'test':
      return { name: 'test', moduleId: parts[1], testId: parts[2] }
    case 'words':
    case 'stats':
    case 'settings':
    case 'help':
      return { name: parts[0] }
  }
  return { name: 'home' }
}

export function href(r: Route): string {
  switch (r.name) {
    case 'step':
      return `#/step/${r.moduleId}/${r.stepId}`
    case 'test':
      return `#/test/${r.moduleId}/${r.testId}`
    case 'home':
      return '#/'
    default:
      return `#/${r.name}`
  }
}

export function go(r: Route) {
  window.location.hash = href(r)
}

export function useRoute(): Route {
  const [r, setR] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const on = () => {
      setR(parse(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
