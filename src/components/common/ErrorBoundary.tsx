import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time throws so a single malformed slide or canvas edge case
 * shows a recoverable screen instead of white-screening the whole app. The
 * project lives in localStorage/IndexedDB and is left untouched — recovery is
 * "try again" (re-render) or a full reload, never a data wipe.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          문제가 발생했어요
        </h1>
        <p className="max-w-md text-sm text-[var(--color-text-dim)]">
          화면을 그리는 중 오류가 났습니다. 작업 내용은 저장돼 있으니 다시 시도하거나
          새로고침해 주세요.
        </p>
        <pre className="max-w-md overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-left text-xs text-[var(--color-text-dim)]">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            다시 시도
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text)] hover:brightness-125"
          >
            새로고침
          </button>
        </div>
      </div>
    )
  }
}
