import { useEffect, useId, useRef, type ReactNode } from 'react'

const SIZE = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' } as const

interface Props {
  title: string
  /** Backdrop click closes; the card swallows clicks. */
  onClose: () => void
  size?: keyof typeof SIZE
  children: ReactNode
}

/**
 * The app's one modal scaffold: dimmed backdrop + centered surface card.
 * Body copy, inputs, and the action row stay with the caller.
 *
 * Escape dismisses and focus returns to whatever opened the dialog — macOS
 * expects keyboard-only operation, and a dialog that traps focus with no way
 * back out is the common failure.
 */
export function Modal({ title, onClose, size = 'md', children }: Props) {
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    // Only claim focus when the caller's own autoFocus hasn't already landed
    // inside the card, so an input keeps the caret it was given.
    if (!cardRef.current?.contains(document.activeElement)) cardRef.current?.focus()
    return () => restoreRef.current?.focus?.()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${SIZE[size]} rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id={titleId}
          className="text-[length:var(--text-title)] font-semibold text-[var(--color-text)]"
        >
          {title}
        </h3>
        {children}
      </div>
    </div>
  )
}
