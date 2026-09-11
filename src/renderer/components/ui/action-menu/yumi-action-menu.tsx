import * as Popover from '@radix-ui/react-popover'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { YumiButton } from '../button/yumi-button'

export type YumiActionMenuItem = {
  disabled?: boolean
  id: string
  label: ReactNode
  onSelect(): void
}

type YumiActionMenuProps = {
  'aria-label': string
  disabled?: boolean
  items: YumiActionMenuItem[]
  triggerLabel?: ReactNode
}

/**
 * 收纳同一实体下低频、非主操作，避免在页面头部平铺多个同权按钮。
 * 页面级唯一主操作仍应保留在页头，记录级动作继续放在对应记录上下文。
 */
export function YumiActionMenu({
  'aria-label': ariaLabel,
  disabled = false,
  items,
  triggerLabel = '更多操作'
}: YumiActionMenuProps) {
  const [open, setOpen] = useState(false)
  const initialFocusPosition = useRef<'first' | 'last'>('first')
  const menuRef = useRef<HTMLDivElement>(null)
  const getEnabledMenuItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)'
      ) ?? []
    )

  const focusInitialMenuItem = () => {
    const menuItems = getEnabledMenuItems()
    const target = initialFocusPosition.current === 'last' ? menuItems.at(-1) : menuItems[0]
    target?.focus()
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return

    event.preventDefault()
    initialFocusPosition.current = event.key === 'ArrowUp' ? 'last' : 'first'
    setOpen(true)
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menuItems = getEnabledMenuItems()
    if (!menuItems.length) return

    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    const activeIndex = currentIndex < 0 ? 0 : currentIndex
    const focusAt = (index: number) => menuItems[index]?.focus()

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt((activeIndex + 1) % menuItems.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt((activeIndex - 1 + menuItems.length) % menuItems.length)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(menuItems.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <YumiButton
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={typeof triggerLabel === 'string' ? triggerLabel : '更多操作'}
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          variant="secondary"
        >
          {triggerLabel}
        </YumiButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          className="yumi-action-menu__content"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            focusInitialMenuItem()
          }}
          sideOffset={6}
        >
          <div
            aria-label={ariaLabel}
            className="yumi-action-menu"
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
          >
            {items.map((item) => (
              <button
                className="yumi-action-menu__item"
                disabled={item.disabled}
                key={item.id}
                onClick={() => {
                  item.onSelect()
                  setOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
