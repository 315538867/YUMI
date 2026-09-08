/// <reference types="vite/client" />
import type { V2YumiApi } from '@shared/contracts/index'

declare global {
  interface Window {
    yumiV2: V2YumiApi
  }
}

export {}
