import { installJsdomMatchesFastPath } from './dom'

// 全局 setup 会同时作用于 node 与 jsdom 环境；非浏览器环境下该函数自行跳过。
installJsdomMatchesFastPath()
