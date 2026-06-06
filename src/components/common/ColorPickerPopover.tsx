import { useEffect, useRef, useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { useT } from '../../i18n'

interface Props {
  color: string
  onChange: (hex: string) => void
  label?: string
}

export function ColorPickerPopover({ color, onChange, label }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex items-center gap-3">
      <button
        type="button"
        aria-label={label ?? t('색상 선택')}
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 shrink-0 rounded-lg border border-[var(--color-border)] shadow-inner"
        style={{ background: color }}
      />
      <HexColorInput
        prefixed
        color={color}
        onChange={onChange}
        className="w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-mono uppercase tracking-wider focus:border-[var(--color-accent)] outline-none"
      />
      {open && (
        <div className="absolute left-0 top-12 z-20 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-2xl">
          <HexColorPicker color={color} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
