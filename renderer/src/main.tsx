// Requirements: E.G.11, E.G.12, E.G.19
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import './styles/index.css'

const container = document.getElementById('root')

if (container) {
  const root = createRoot(container)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
