import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ExperimentProvider } from './context/ExperimentContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LiveExperiment from './pages/LiveExperiment'
import ActivityHistory from './pages/ActivityHistory'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import DesignExperiment from './pages/DesignExperiment'

export default function App() {
  return (
    <ExperimentProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/live" element={<LiveExperiment />} />
            <Route path="/design" element={<DesignExperiment />} />
            <Route path="/history" element={<ActivityHistory />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ExperimentProvider>
  )
}
