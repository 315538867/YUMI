import type { KeyboardEvent, ReactNode } from 'react'

export type YumiDensity = 'compact' | 'comfortable'

export type YumiTabItem<T extends string> = {
  id: T
  label: ReactNode
  disabled?: boolean
}

type YumiTabsProps<T extends string> = {
  ariaLabel: string
  density?: YumiDensity
  items: readonly YumiTabItem<T>[]
  onValueChange: (value: T) => void
  value: T
}

export type { YumiTabsProps }

/**
 * 两层标签均按“同层切换”处理：方向键循环，Home/End 跳到边界，并跳过禁用项。
 * 组件仍使用 nav + button，而非误用 tablist，避免把页面切换伪装成同一面板内的 tabpanel。
 */
function handleTabNavigation<T extends string>(
  event: KeyboardEvent<HTMLButtonElement>,
  currentId: T,
  items: readonly YumiTabItem<T>[],
  onValueChange: (value: T) => void
) {
  const enabledItems = items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => !item.disabled)
  const currentIndex = enabledItems.findIndex(({ item }) => item.id === currentId)

  if (currentIndex === -1 || enabledItems.length < 2) {
    return
  }

  let nextIndex: number | null = null
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % enabledItems.length
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length
      break
    case 'Home':
      nextIndex = 0
      break
    case 'End':
      nextIndex = enabledItems.length - 1
      break
    default:
      return
  }

  const target = enabledItems[nextIndex]
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')
  buttons?.[target.index]?.focus()
  onValueChange(target.item.id)
  event.preventDefault()
}

export function YumiPrimaryTabs<T extends string>({
  ariaLabel,
  density = 'compact',
  items,
  onValueChange,
  value
}: YumiTabsProps<T>) {
  return (
    <nav aria-label={ariaLabel} className={`yumi-primary-tabs yumi-primary-tabs--${density}`}>
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            aria-current={selected ? 'page' : undefined}
            className={
              selected
                ? 'yumi-primary-tabs__item yumi-primary-tabs__item--active'
                : 'yumi-primary-tabs__item'
            }
            disabled={item.disabled}
            key={item.id}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(event) => handleTabNavigation(event, item.id, items, onValueChange)}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export function YumiSegmentedTabs<T extends string>({
  ariaLabel,
  density = 'compact',
  items,
  onValueChange,
  value
}: YumiTabsProps<T>) {
  return (
    <nav aria-label={ariaLabel} className={`yumi-segmented-tabs yumi-segmented-tabs--${density}`}>
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            aria-pressed={selected}
            className={
              selected
                ? 'yumi-segmented-tabs__item yumi-segmented-tabs__item--active'
                : 'yumi-segmented-tabs__item'
            }
            disabled={item.disabled}
            key={item.id}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(event) => handleTabNavigation(event, item.id, items, onValueChange)}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
