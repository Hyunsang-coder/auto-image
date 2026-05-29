interface Props {
  onUndo: () => void
  onRedo: () => void
}

export function CanvasToolbar({ onUndo, onRedo }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
      <button
        type="button"
        title="Undo (Cmd+Z)"
        onClick={onUndo}
        className="rounded px-2 py-1 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition"
      >
        Undo
      </button>
      <div className="h-4 w-px bg-[var(--color-border)]" />
      <button
        type="button"
        title="Redo (Cmd+Shift+Z)"
        onClick={onRedo}
        className="rounded px-2 py-1 text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition"
      >
        Redo
      </button>
    </div>
  )
}
