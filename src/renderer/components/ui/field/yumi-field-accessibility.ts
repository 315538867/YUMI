import { createContext, useContext, type AriaAttributes } from 'react'

export type YumiFieldAccessibilityProps = Pick<
  AriaAttributes,
  'aria-describedby' | 'aria-invalid' | 'aria-label' | 'aria-labelledby'
>

export type YumiFieldContextValue = {
  descriptionId?: string
  invalid: boolean
  labelId?: string
}

export const YumiFieldContext = createContext<YumiFieldContextValue | undefined>(undefined)

function mergeAriaIds(...ids: Array<string | undefined>) {
  const merged = ids.filter(Boolean).join(' ')
  return merged || undefined
}

/**
 * 让复合表单控件复用字段容器的名称、说明与错误反馈，避免业务页面为每个控件重复拼接 ARIA 属性。
 */
export function useYumiFieldAccessibility(props: YumiFieldAccessibilityProps = {}) {
  const field = useContext(YumiFieldContext)

  return {
    'aria-describedby': mergeAriaIds(props['aria-describedby'], field?.descriptionId),
    'aria-invalid': field?.invalid ? true : props['aria-invalid'],
    'aria-labelledby':
      props['aria-labelledby'] ?? (props['aria-label'] ? undefined : field?.labelId)
  }
}
