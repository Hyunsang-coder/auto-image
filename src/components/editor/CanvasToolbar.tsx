interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

const btn =
  'rounded px-2 py-1 text-xs text-[var(--color-text-dim)] transition enabled:hover:bg-[var(--color-surface-2)] enabled:hover:text-[var(--color-text)] disabled:opacity-30 disabled:cursor-not-allowed'

export function CanvasToolbar({ canUndo, canRedo, onUndo, onRedo }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
      <button type="button" title="Undo (Cmd+Z)" onClick={onUndo} disabled={!canUndo} className={btn}>
        Undo
      </button>
      <div className="h-4 w-px bg-[var(--color-border)]" />
      <button
        type="button"
        title="Redo (Cmd+Shift+Z)"
        onClick={onRedo}
        disabled={!canRedo}
        className={btn}
      >
        Redo
      </button>
    </div>
  )
}
