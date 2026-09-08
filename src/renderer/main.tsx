import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@daypicker/react/style.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/pages.css'
import { App } from './pages/app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
