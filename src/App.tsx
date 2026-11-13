import { useStore } from './store'
import { href, useRoute } from './router'
import Home from './pages/Home'
import StepPage from './pages/StepPage'
import TestPage from './pages/TestPage'
import Words from './pages/Words'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Help from './pages/Help'

const NAV = [
  { name: 'home', label: 'Курс' },
  { name: 'words', label: 'Словарик' },
  { name: 'stats', label: 'Успехи' },
  { name: 'settings', label: 'Модули и настройки' }
] as const

export default function App() {
  const route = useRoute()
  const { modules, progress } = useStore()
  const pending = progress.outbox.filter((o) => !o.sentAt).length

  let page
  switch (route.name) {
    case 'step':
      page = <StepPage key={`${route.moduleId}/${route.stepId}`} moduleId={route.moduleId} stepId={route.stepId} />
      break
    case 'test':
      page = <TestPage key={`${route.moduleId}/${route.testId}`} moduleId={route.moduleId} testId={route.testId} />
      break
    case 'words':
      page = <Words />
      break
    case 'stats':
      page = <Stats />
      break
    case 'settings':
      page = <Settings />
      break
    case 'help':
      page = <Help />
      break
    default:
      page = modules.length ? <Home /> : <Help first />
  }

  const inTest = route.name === 'test'

  return (
    <div className="app">
      <header className={`topbar ${inTest ? 'quiet' : ''}`}>
        <a className="brand" href={href({ name: 'home' })} aria-label="На карту курса">
          <svg viewBox="0 0 40 24" width="34" height="20" aria-hidden="true">
            {['#E9483B', '#F2C230', '#4CB66A', '#3A6FD8', '#9B4FC8'].map((c, i) => (
              <path key={c} d={`M${4 + i * 3} 22 A ${16 - i * 3} ${16 - i * 3} 0 0 1 ${36 - i * 3} 22`} stroke={c} strokeWidth="2.6" fill="none" />
            ))}
          </svg>
          <span>Rainbow English</span>
        </a>
        {!inTest && (
          <nav>
            {NAV.map((n) => (
              <a key={n.name} href={href({ name: n.name } as never)} className={route.name === n.name ? 'on' : ''}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
        {pending > 0 && !inTest && (
          <span className="outbox-dot" title={`Отчётов ждут отправки: ${pending}`}>
            {pending}
          </span>
        )}
      </header>
      <main>{page}</main>
    </div>
  )
}
