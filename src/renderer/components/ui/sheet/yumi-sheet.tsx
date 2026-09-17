import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useOverlayFocusRestore } from '../focus-restore'
import { useDensity } from '../../patterns/density'
import { YumiButton } from '../button/yumi-button'
import { YumiConfirmDialog } from '../dialog/yumi-dialog'
import type { YumiDensity } from '../tabs/yumi-tabs'

type YumiSheetFooterActions = {
  requestClose(): void
}

type YumiSheetProps = {
  children: ReactNode
  density?: YumiDensity
  description?: ReactNode
  dirty?: boolean
  footer?: ReactNode | ((actions: YumiSheetFooterActions) => ReactNode)
  onOpenChange(open: boolean): void
  open: boolean
  title: string
}

export function YumiSheet({
  children,
  density = 'comfortable',
  description,
  dirty = false,
  footer,
  onOpenChange,
  open,
  title
}: YumiSheetProps) {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const contextDensity = useDensity()
  useOverlayFocusRestore(open)

  const requestClose = () => {
    if (dirty) {
      setDiscardConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  return (
    <>
      <Dialog.Root
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose()
        }}
        open={open}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="yumi-dialog__overlay" />
          <Dialog.Content
            className={`yumi-sheet yumi-sheet--${density}`}
            data-density={contextDensity}
            onEscapeKeyDown={(event) => {
              if (dirty) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (dirty) event.preventDefault()
            }}
          >
            <div className="yumi-sheet__header">
              <div>
                <Dialog.Title className="yumi-dialog__title">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="yumi-dialog__description">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <YumiButton aria-label={`关闭${title}`} onClick={requestClose} variant="ghost">
                <X aria-hidden="true" size={17} />
              </YumiButton>
            </div>
            <div className="yumi-sheet__body">{children}</div>
            {footer ? (
              <div className="yumi-sheet__footer">
                {typeof footer === 'function' ? footer({ requestClose }) : footer}
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <YumiConfirmDialog
        cancelLabel="继续编辑"
        confirmLabel="放弃修改"
        description="关闭后，本次尚未保存的填写内容不会保留。"
        destructive
        onConfirm={() => {
          setDiscardConfirmOpen(false)
          onOpenChange(false)
        }}
        onOpenChange={setDiscardConfirmOpen}
        open={discardConfirmOpen}
        title="放弃未保存的修改？"
      />
    </>
  )
}
