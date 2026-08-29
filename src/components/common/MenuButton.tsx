import { useEffect, useId, useRef, useState } from 'react'

export interface MenuAction {
  label: string
  onSelect: () => void
  /** Renders in the danger colour and sits below a separator. */
  destructive?: boolean
  disabled?: boolean
}

interface Props {
  /** Accessible name for the trigger; also its tooltip. */
  label: string
  items: MenuAction[]
  /** Trigger glyph. Defaults to the HIG "more" ellipsis. */
  glyph?: string
}

/**
 * Pull-down menu for toolbar overflow. The HIG caps a toolbar at roughly three
 * groups of text actions and asks for a More menu beyond that, so secondary
 * commands live here rather than as more buttons in a row.
 *
 * Keyboard-complete on purpose (macOS expects keyboard-only operation): arrows
 * move, Home/End jump, Escape closes and returns focus to the trigger.
 */
export function MenuButton({ label, items, glyph = '···' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active])

  function openAt(index: number) {
    setActive(index)
    setOpen(true)
  }

  function close(refocus = true) {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  function step(delta: number) {
    if (!enabled.length) return
    const pos = enabled.indexOf(active)
    const next = enabled[(pos + delta + enabled.length) % enabled.length]
    setActive(next)
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(enabled[0] ?? 0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(enabled[enabled.length - 1] ?? 0)
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(enabled[0] ?? 0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openAt(e.key === 'ArrowDown' ? (enabled[0] ?? 0) : (enabled[enabled.length - 1] ?? 0))
          }
        }}
        className={[
          'inline-flex h-[var(--control-h)] w-[var(--control-h)] items-center justify-center rounded-md',
          'border text-[length:var(--text-ui)] leading-none transition',
          open
            ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-3)] text-[var(--color-text)]'
            : 'border-[var(--color-border-strong)] text-[var(--color-text-dim)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]',
        ].join(' ')}
      >
        <span aria-hidden>{glyph}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(var(--control-h)+6px)] z-40 min-w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl"
        >
          {items.map((item, i) => (
            <div key={item.label}>
              {item.destructive && i > 0 && (
                <div role="separator" className="my-1 h-px bg-[var(--color-border)]" />
              )}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={i === active ? 0 : -1}
                onMouseEnter={() => !item.disabled && setActive(i)}
                onClick={() => {
                  close()
                  item.onSelect()
                }}
                className={[
                  'flex h-[var(--control-h)] w-full items-center rounded-md px-2.5 text-left',
                  'text-[length:var(--text-ui)] transition disabled:cursor-not-allowed disabled:opacity-40',
                  item.destructive ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]',
                  'hover:bg-[var(--color-surface-3)]',
                ].join(' ')}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
