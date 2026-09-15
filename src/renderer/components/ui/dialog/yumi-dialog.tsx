import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { YumiButton } from '../button/yumi-button'

type YumiDialogProps = {
  children: ReactNode
  description?: ReactNode
  footer?: ReactNode
  onOpenChange(open: boolean): void
  open: boolean
  /** 宽尺寸用于需要承载明细表格或并列字段的工作区表单。 */
  size?: 'default' | 'wide'
  title: ReactNode
}

export function YumiDialog({
  children,
  description,
  footer,
  onOpenChange,
  open,
  size = 'default',
  title
}: YumiDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="yumi-dialog__overlay" />
        <Dialog.Content
          className={
            size === 'wide'
              ? 'yumi-dialog__content yumi-dialog__content--wide'
              : 'yumi-dialog__content'
          }
        >
          <div className="yumi-dialog__header">
            <div>
              <Dialog.Title className="yumi-dialog__title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="yumi-dialog__description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <YumiButton aria-label={`关闭${title}`} variant="ghost">
                <X aria-hidden="true" size={17} />
              </YumiButton>
            </Dialog.Close>
          </div>
          <div className="yumi-dialog__body">{children}</div>
          {footer ? <div className="yumi-dialog__footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type YumiConfirmDialogProps = {
  cancelLabel?: string
  confirmLabel?: string
  description?: ReactNode
  destructive?: boolean
  onConfirm(): void
  onOpenChange(open: boolean): void
  open: boolean
  title: ReactNode
}

export function YumiConfirmDialog({
  cancelLabel = '取消',
  confirmLabel = '确认',
  description,
  destructive = true,
  onConfirm,
  onOpenChange,
  open,
  title
}: YumiConfirmDialogProps) {
  return (
    <AlertDialog.Root onOpenChange={onOpenChange} open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="yumi-dialog__overlay" />
        <AlertDialog.Content className="yumi-dialog__content yumi-dialog__content--confirm">
          <AlertDialog.Title className="yumi-dialog__title">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="yumi-dialog__description">
              {description}
            </AlertDialog.Description>
          ) : null}
          <div className="yumi-dialog__footer">
            <AlertDialog.Cancel asChild>
              <YumiButton variant="secondary">{cancelLabel}</YumiButton>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <YumiButton onClick={onConfirm} variant={destructive ? 'danger' : 'primary'}>
                {confirmLabel}
              </YumiButton>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
