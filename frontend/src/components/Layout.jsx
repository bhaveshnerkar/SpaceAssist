import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'
import MissionStrip from './MissionStrip'
import VoiceAssistant from './VoiceAssistant'
import { useExperiment } from '../context/ExperimentContext'

export default function Layout() {
  const { experiment, connectionStatus } = useExperiment()
  return (
    <div className="app-shell">
      <NavBar />
      <MissionStrip experiment={experiment} connectionStatus={connectionStatus} />
      <main className="app-main">
        <Outlet />
      </main>
      <VoiceAssistant />
    </div>
  )
}
