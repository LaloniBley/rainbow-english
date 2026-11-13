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
  { name: 'home', label: 'Курс', short: 'Курс', icon: 'M3 18a9 9 0 0 1 18 0M7 18a5 5 0 0 1 10 0' },
  { name: 'words', label: 'Словарик', short: 'Слова', icon: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10' },
  { name: 'stats', label: 'Успехи', short: 'Успехи', icon: 'M5 20V11M12 20V5M19 20v-6' },
  { name: 'settings', label: 'Модули и настройки', short: 'Настройки', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.4 7.4 0 0 0-1.7-1L15 3.6h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.3 1 2-3.4z' }
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
    <div className={`app ${inTest ? 'in-test' : ''}`}>
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
              <a key={n.name} href={href({ name: n.name } as never)} className={route.name === n.name ? 'on' : ''} aria-label={n.label}>
                <svg className="nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="nav-long">{n.label}</span>
                <span className="nav-short">{n.short}</span>
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
