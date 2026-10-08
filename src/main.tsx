import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NexusApp } from './App'
import './styles.css'

const startupParams = new URLSearchParams(window.location.search)
const spaPath = startupParams.get('spa')

if (spaPath) {
  window.history.replaceState({}, '', `${import.meta.env.BASE_URL}${spaPath}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NexusApp />
  </StrictMode>,
)
