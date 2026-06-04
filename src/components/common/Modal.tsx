import type { ReactNode } from 'react'

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
 */
export function Modal({ title, onClose, size = 'md', children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className={`w-full ${SIZE[size]} rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
        {children}
      </div>
    </div>
  )
}
