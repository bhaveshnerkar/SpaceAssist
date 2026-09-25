import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/live', label: 'Live Experiment' },
  { to: '/design', label: 'Design Experiment' },
  { to: '/history', label: 'Activity History' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/settings', label: 'Settings' },
]

export default function NavBar() {
  return (
    <header className="nav-bar">
      <div className="nav-bar__brand">
        <span className="nav-bar__mark" aria-hidden="true" />
        <span className="nav-bar__wordmark">
          SPACE<span style={{ color: 'var(--status-active)' }}>ASSIST</span> AI
        </span>
      </div>
      <nav className="nav-bar__links">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => `nav-bar__link${isActive ? ' nav-bar__link--active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
