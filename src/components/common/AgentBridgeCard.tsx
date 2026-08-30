import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useI18nStore, useT } from '../../i18n'
import { getBridgeStatus, isTauri, setBridgeEnabled, type BridgeStatus } from '../../lib/tauri'

// What an agent actually needs from this card. The socket path alone is not
// connectable — the thing that talks to it is the published MCP server, so the
// card hands over a config that names it.
const MCP_CONFIG = JSON.stringify(
  { mcpServers: { 'screenshot-studio': { command: 'npx', args: ['-y', 'screenshot-studio-mcp'] } } },
  null,
  2,
)
const CLAUDE_CODE_CMD = 'claude mcp add screenshot-studio -- npx -y screenshot-studio-mcp'

/**
 * Header status + switch for the agent bridge — the socket an MCP server talks
 * to when an agent drives the project open in this window.
 *
 * The address on show is a unix socket path rather than a `127.0.0.1` URL on
 * purpose: a page in a browser cannot open a unix socket, which is what keeps a
 * random web page from driving a desktop app that writes files (docs/adr.md).
 */
export function AgentBridgeCard() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  const locale = useI18nStore((st) => st.locale)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Rust owns the answer, so re-read on open: a start can fail (a second window
  // owns the socket) long after the first read.
  useEffect(() => {
    void getBridgeStatus().then(setStatus)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  if (!isTauri() || !status) return null

  async function toggle() {
    if (!status || busy) return
    setBusy(true)
    try {
      setStatus(await setBridgeEnabled(!status.enabled))
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFailed(false)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1500)
    } catch {
      setCopyFailed(true)
    }
  }

  const guideUrl =
    locale === 'ko'
      ? 'https://screenshotstudio.dev/guides/ko/mcp-agent.html'
      : 'https://screenshotstudio.dev/guides/mcp-agent.html'

  const running = status.running
  const stateLabel = running ? t('실행 중') : t('중지됨')

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('MCP 서버')} — ${stateLabel}`}
        title={`${t('MCP 서버')} — ${stateLabel}`}
        className={[
          'inline-flex h-[var(--control-h)] items-center gap-1.5 rounded-md border px-2',
          'text-[length:var(--text-ui-sm)] font-medium transition',
          open
            ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-3)] text-[var(--color-text)]'
            : 'border-[var(--color-border-strong)] text-[var(--color-text-dim)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]',
        ].join(' ')}
      >
        <Dot running={running} />
        MCP
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('MCP 서버')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
            }
          }}
          className="absolute right-0 top-[calc(var(--control-h)+6px)] z-40 w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--text-title)] font-semibold text-[var(--color-text)]">
              {t('MCP 서버')}
            </span>
            <Switch
              checked={status.enabled}
              disabled={busy}
              label={t('MCP 서버 사용')}
              onToggle={() => void toggle()}
            />
          </div>

          <p
            className={[
              'mt-1.5 flex items-center gap-1.5 text-[length:var(--text-ui-sm)]',
              running ? 'text-[var(--color-success)]' : 'text-[var(--color-text-dim)]',
            ].join(' ')}
          >
            <Dot running={running} />
            {stateLabel}
          </p>

          {status.error && (
            <p className="mt-1 text-[length:var(--text-ui-sm)] text-[var(--color-danger)]">
              {status.error}
            </p>
          )}

          <div className="mt-2.5">
            <div className="text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
              {t('에이전트 연결 설정')}
            </div>
            <pre className="mt-1 max-h-28 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-[length:var(--text-ui-xs)] leading-snug text-[var(--color-text)]">
              {MCP_CONFIG}
            </pre>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <CardButton onClick={() => void copy(MCP_CONFIG, 'config')}>
                {copied === 'config' ? t('복사됨 ✓') : t('설정 복사')}
              </CardButton>
              <CardButton onClick={() => void copy(CLAUDE_CODE_CMD, 'cli')}>
                {copied === 'cli' ? t('복사됨 ✓') : t('Claude Code 명령 복사')}
              </CardButton>
              {/* No browser to hand it to (or the ACL said no) — leave the URL on
                  the clipboard rather than a dead button. */}
              <CardButton onClick={() => void openUrl(guideUrl).catch(() => copy(guideUrl, 'guide'))}>
                {copied === 'guide' ? t('주소 복사됨 ✓') : t('가이드')}
              </CardButton>
            </div>
            {copyFailed && (
              <p className="mt-1 text-[length:var(--text-ui-sm)] text-[var(--color-danger)]">
                {t('복사 실패 — 클립보드 권한을 확인하세요')}
              </p>
            )}
          </div>

          <p className="mt-2.5 text-[length:var(--text-ui-sm)] leading-snug text-[var(--color-text-dim)]">
            {t('연결된 에이전트가 이 창에 열려 있는 프로젝트를 직접 편집합니다. 끄면 파일로 주고받는 방식만 남습니다.')}
          </p>

          {/* Debugging aid, not the address anyone connects to — hence the demotion. */}
          <button
            type="button"
            onClick={() => void copy(status.socketPath, 'socket')}
            title={status.socketPath}
            className="mt-2 block w-full truncate text-left text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-text)]"
          >
            {copied === 'socket' ? t('복사됨 ✓') : `${t('소켓 경로')}: ${status.socketPath}`}
          </button>
        </div>
      )}
    </div>
  )
}

function CardButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[var(--control-h-sm)] rounded-md border border-[var(--color-border-strong)] px-2 text-[length:var(--text-ui-sm)] text-[var(--color-text-dim)] transition hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
    >
      {children}
    </button>
  )
}

function Dot({ running }: { running: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        'inline-block h-2 w-2 shrink-0 rounded-full',
        running ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-dim)]',
      ].join(' ')}
    />
  )
}

/**
 * The track is 20px — the macOS minimum control size — and the button around it
 * pads that out to the standard 28px hit area.
 */
function Switch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex h-[var(--control-h)] shrink-0 items-center px-0.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={[
          'relative block h-5 w-9 rounded-full border transition-colors',
          checked
            ? 'border-[var(--color-accent-strong)] bg-[var(--color-accent-strong)]'
            : 'border-[var(--color-border-strong)] bg-[var(--color-surface-3)]',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[2px] block h-4 w-4 rounded-full transition-all',
            checked
              ? 'left-[18px] bg-[var(--color-accent-on)]'
              : 'left-[2px] border border-[var(--color-border-strong)] bg-[var(--color-surface)]',
          ].join(' ')}
        />
      </span>
    </button>
  )
}
