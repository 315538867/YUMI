/** 仅供 JSDOM 组件测试使用：Electron 运行时原生提供这些浏览器 API。 */
export function installDomInteractionPolyfills() {
  if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => undefined
    })
  }
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
}

const topLayerStateSelectors = new Set([':modal', ':fullscreen'])

/**
 * jsdom 未实现 modal/fullscreen 状态；nwsapi 2.2.27 匹配这两个伪类时会递归回 Element.matches
 * 并以栈溢出终止，单次匹配内部放大上百万次调用，导致 Radix 浮层用例整体慢 10-50 秒。
 * 这里按 nwsapi 在 jsdom 中的既有回退语义（比较 fullscreenElement 状态）短路。
 */
export function installJsdomMatchesFastPath() {
  if (typeof Element === 'undefined') return
  const original = Element.prototype.matches

  Element.prototype.matches = function (selector: string) {
    if (topLayerStateSelectors.has(selector)) {
      const document = this.ownerDocument as FullscreenDocument | null
      return Boolean(
        document &&
        (document.fullscreenElement === this ||
          document.webkitFullscreenElement === this ||
          document.mozFullScreenElement === this ||
          document.msFullscreenElement === this)
      )
    }
    return original.call(this, selector)
  }
}
