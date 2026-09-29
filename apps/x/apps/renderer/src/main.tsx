import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@/contexts/theme-context'
import { startRendererAnalytics } from './lib/analytics'

// Fetch the stable installation ID from main so renderer + main share one
// PostHog distinct_id. Analytics stays uninitialized unless privacy.json says
// the user turned it on. A missing file is not consent.
async function bootstrap() {
  let installationId: string | undefined
  let apiUrl: string | undefined
  let appVersion: string | undefined
  let shareUsageData = false
  try {
    const result = await window.ipc.invoke('analytics:bootstrap', null)
    installationId = result.installationId
    apiUrl = result.apiUrl
    appVersion = result.appVersion
    shareUsageData = result.shareUsageData
  } catch (err) {
    console.error('[Analytics] Failed to bootstrap from main:', err)
  }

  if (shareUsageData) {
    startRendererAnalytics({ installationId, apiUrl, appVersion })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeProvider defaultTheme="system">
        <App />
      </ThemeProvider>
    </StrictMode>,
  )
}

bootstrap()
