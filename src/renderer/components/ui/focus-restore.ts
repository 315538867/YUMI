import { useEffect, useRef } from 'react'

/**
 * 受控浮层没有 Radix Trigger，Radix 默认的焦点归还（triggerRef）不会生效；
 * 这里在打开时记录当前焦点元素，关闭后归还，满足「关闭浮层后焦点回到原触发位置」契约。
 */
export function useOverlayFocusRestore(open: boolean) {
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }
    const opener = openerRef.current
    openerRef.current = null
    if (opener && document.contains(opener)) {
      window.setTimeout(() => opener.focus(), 0)
    }
  }, [open])
}
