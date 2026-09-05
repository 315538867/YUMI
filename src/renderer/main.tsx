import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import './styles/app.css'
import { App } from './pages/app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme appearance="light" accentColor="orange" grayColor="sand" radius="medium" scaling="100%">
      <App />
    </Theme>
  </StrictMode>
)
