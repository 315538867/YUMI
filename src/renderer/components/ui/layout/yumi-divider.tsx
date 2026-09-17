type YumiDividerProps = {
  orientation?: 'horizontal' | 'vertical'
}

/** 纯视觉分隔线，不向辅助技术暴露语义。 */
export function YumiDivider({ orientation = 'horizontal' }: YumiDividerProps) {
  return (
    <hr
      aria-hidden="true"
      className={`yumi-divider${orientation === 'vertical' ? ' yumi-divider--vertical' : ''}`}
    />
  )
}
