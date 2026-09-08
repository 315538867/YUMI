/** 仅供 JSDOM 组件测试使用：Electron 运行时原生提供这些浏览器 API。 */
export function installDomInteractionPolyfills() {
  if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined
    })
  }
}
