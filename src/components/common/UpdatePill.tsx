import { openUrl } from '@tauri-apps/plugin-opener'
import { useT } from '../../i18n'
import type { UpdateCheck } from '../../lib/tauri'

/**
 * The one thing a launch-time check may say out loud. Silent when the build is
 * current — an "you are up to date" badge in the toolbar is noise, so that
 * answer only appears when the user asks for it from the menu.
 */
export function UpdatePill({ update }: { update: UpdateCheck | null }) {
  const t = useT()
  if (!update?.newer) return null

  return (
    <button
      type="button"
      onClick={() => void openUrl(update.url).catch(() => {})}
      title={t('릴리스 페이지 열기')}
      className="inline-flex h-[var(--control-h)] shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-accent-strong)] px-2 text-[length:var(--text-ui-sm)] font-medium text-[var(--color-accent-strong)] transition hover:bg-[var(--color-accent-strong)] hover:text-[var(--color-accent-on)]"
    >
      {t('새 버전 {v}', { v: update.latest })}
    </button>
  )
}
