import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = '확인',
  cancelLabel = '취소'
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmBtnRef.current?.focus()

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <>
      <div className="confirm-overlay" onClick={onCancel} />
      <div className="confirm-dialog" role="alertdialog" aria-modal="true">
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmBtnRef} className="confirm-btn-ok" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </>
  )
}
