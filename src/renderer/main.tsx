import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { AppRuntimeGuard } from './components/app-runtime-guard'
import { YumiNotificationProvider } from './components/ui'
import { App } from './pages/app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <YumiNotificationProvider>
      <AppRuntimeGuard hasDesktopApi={typeof window.yumiV2 !== 'undefined'}>
        <App />
      </AppRuntimeGuard>
    </YumiNotificationProvider>
  </StrictMode>
)
