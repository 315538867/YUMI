/// <reference types="vite/client" />
import type { YumiApi, V2YumiApi } from '@shared/contracts'

declare global {
  interface Window {
    /** 旧页面仅用于迁移期的静态编译；预加载层不会再暴露该对象。 */
    yumi: YumiApi
    yumiV2: V2YumiApi
  }
}

export {}
