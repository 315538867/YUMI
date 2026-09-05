/// <reference types="vite/client" />
import type { YumiApi } from '@shared/contracts'

declare global {
  interface Window {
    yumi: YumiApi
  }
}

export {}
