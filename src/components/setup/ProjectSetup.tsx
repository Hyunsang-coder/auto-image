import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Project } from '../../types/project'
import { DEFAULT_BACKGROUND } from '../../constants/defaults'
import { DEFAULT_MODEL } from '../../constants/deviceSpecs'
import { useProjectStore } from '../../store/useProjectStore'
import { useLibraryStore } from '../../store/useLibraryStore'
import { useCustomStore } from '../../store/useCustomStore'
import { allReferencedImageKeys, gcImages } from '../../lib/imageRefs'
import { pruneOrphanImages } from '../../lib/imageStore'
import { routeOpenFiles, runProjectImport, type ImportRunResult } from '../../lib/projectImportRun'
import { importProjectBundle } from '../../lib/projectBundle'
import {
  adoptAsDocument,
  ensureSaved,
  forgetRecent,
  openRecent,
  pickAndOpen,
  projectPreview,
  useDocumentStore,
} from '../../lib/documentIO'
import { docNameFromPath } from '../../lib/documentModel'
import { isTauri } from '../../lib/tauri'
import {
  BUILTIN_PROJECT_TEMPLATES,
  buildProjectFromTemplate,
  type ProjectTemplate,
} from '../../constants/projectTemplates'
import { Modal } from '../common/Modal'
import { useT } from '../../i18n'
import { formatTime } from '../../lib/formatTime'

/**
 * A blank project starts with one slide and the default device; the editor's
 * tray adds the rest. Nothing here asks for a device type either — the first
 * screenshot decides it (`detectTypeFromAspect`), so asking would only let the
 * user contradict the app.
 */
const NEW_SLIDE_COUNT = 1

/**
 * Card previews, keyed by content. Module-level because every miss costs a
 * Fabric render, and leaving the editor comes back to this screen constantly.
 */
const previewCache = new Map<string, string>()

/**
 * The home screen: what you already have, then the ways to start something new.
 * It is not a form — every question the old setup form asked (name, device,
 * size, slide count, background) is answerable later in the editor, where the
 * controls already exist, and one of them the app answers by itself.
 */
export function ProjectSetup() {
  const t = useT()
  const createProject = useProjectStore((s) => s.createProject)
  const existingProject = useProjectStore((s) => s.project)
  const setStep = useProjectStore((s) => s.setStep)
  const loadProject = useProjectStore((s) => s.loadProject)
  const savedProjects = useLibraryStore((s) => s.projects)
  const removeProject = useLibraryStore((s) => s.removeProject)
  const userTemplates = useCustomStore((s) => s.projectTemplates)
  const removeProjectTemplate = useCustomStore((s) => s.removeProjectTemplate)
  const docPath = useProjectStore((s) => s.docPath)
  const recents = useDocumentStore((s) => s.recents)
  const [confirmRemove, setConfirmRemove] = useState<
    { kind: 'project' | 'template'; id: string; label: string } | null
  >(null)
  const [confirmLoad, setConfirmLoad] = useState<Project | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportRunResult | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  // Files picked alongside a bundle, so the surplus can be reported.
  const [ignoredOnOpen, setIgnoredOnOpen] = useState(0)
  const [bundleError, setBundleError] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // On the desktop the list below is Recents (real files, thumbnail cached on
  // save); on the web it is the in-browser library, which has nowhere else to
  // live.
  const desktop = isTauri()

  async function doCreate() {
    createProject({
      name: t('제목 없음'),
      devices: ['iphone'],
      deviceModels: { iphone: DEFAULT_MODEL.iphone },
      screenshotCount: NEW_SLIDE_COUNT,
      themeBackground: structuredClone(DEFAULT_BACKGROUND),
    })
    setConfirmNew(false)
    // A new project becomes a file straight away. There is no "unsaved,
    // untitled" state on the desktop: the whole point of the document model is
    // that work cannot be lost by forgetting to save it.
    if (desktop) {
      const created = useProjectStore.getState().project
      if (created) await adoptAsDocument(created)
    }
  }

  function handleNew() {
    // Desktop: the open project is a file, so the question is whether to save
    // it — three buttons, not "replace / cancel".
    if (desktop) {
      void (async () => {
        if (await ensureSaved('new')) await doCreate()
      })()
      return
    }
    if (existingProject) {
      setConfirmNew(true)
      return
    }
    void doCreate()
  }

  function handleLoad(p: Project) {
    if (desktop) {
      void (async () => {
        if (await ensureSaved('open')) await doLoad(p)
      })()
      return
    }
    // Loading replaces the active project. Confirm first if there's current
    // work that hasn't been explicitly saved into the library as-is.
    if (existingProject) {
      setConfirmLoad(p)
      return
    }
    void doLoad(p)
  }

  async function doLoad(p: Project) {
    loadProject(p)
    setConfirmLoad(null)
    // The outgoing project's blobs are swept if nothing else references them.
    gcImages()
    // Same rule as a new project: whatever route produced it — a template, an
    // agent-authored file set — it lands as a file of its own.
    if (desktop) {
      const loaded = useProjectStore.getState().project
      if (loaded) await adoptAsDocument(loaded)
    }
  }

  // Starting from a template builds a fresh project, then routes through the
  // same load path (so it confirms before overwriting current work).
  function startFromTemplate(tpl: ProjectTemplate) {
    handleLoad(buildProjectFromTemplate(tpl, tpl.label))
  }

  function handleRemove() {
    if (!confirmRemove) return
    if (confirmRemove.kind === 'project') {
      removeProject(confirmRemove.id)
      // Sweep any image blobs the deleted project no longer keeps alive.
      pruneOrphanImages(allReferencedImageKeys())
    } else {
      removeProjectTemplate(confirmRemove.id)
    }
    setConfirmRemove(null)
  }

  // The import runs uncommitted, then one modal shows the summary/warnings and
  // doubles as the overwrite confirmation. Cancel sweeps the blobs the dry run
  // already persisted to IndexedDB (unreferenced → gcImages collects them).
  async function handleImportFiles(files: File[]) {
    setImportBusy(true)
    try {
      const result = await runProjectImport(files)
      setImportResult(result)
      // Headless channel: publish the structured import result so the harness
      // can detect completion (and read applied/issues) without scraping the
      // localized summary text. __validateEnabled stops before commit; __headless
      // keeps going (read result, then click confirm to render).
      const w = window as Window & {
        __validateEnabled?: boolean
        __headless?: boolean
        __importResult?: string
      }
      if (w.__validateEnabled || w.__headless) {
        w.__importResult = JSON.stringify({
          ok: !!result.project,
          applied: result.applied,
          addedLocales: result.addedLocales,
          issues: result.issues,
          project: result.project,
        })
      }
    } finally {
      setImportBusy(false)
    }
  }

  function confirmImport() {
    if (!importResult?.project) return
    const imported = importResult.project
    setImportResult(null)
    void doLoad(imported)
  }

  function cancelImport() {
    setImportResult(null)
    gcImages()
  }

  // One pick, two destinations: a .zip is a saved project bundle, anything else
  // is the agent-authored file set. Surplus files alongside a bundle are
  // reported rather than silently dropped.
  async function handleOpenFiles(files: File[]) {
    const choice = routeOpenFiles(files)
    if (choice.kind === 'empty') return
    if (choice.kind === 'import') {
      setIgnoredOnOpen(0)
      await handleImportFiles(choice.files)
      return
    }
    setIgnoredOnOpen(choice.ignored)
    await handleOpenBundle(choice.file)
  }

  async function handleOpenBundle(file: File) {
    setImportBusy(true)
    try {
      handleLoad(await importProjectBundle(file)) // confirm-on-overwrite reused
    } catch {
      setBundleError(true)
    } finally {
      setImportBusy(false)
    }
  }

  // Bundle open writes blobs before the load is confirmed; sweep them if declined.
  function cancelLoad() {
    setConfirmLoad(null)
    gcImages()
  }

  const hasProjects = desktop ? recents.length > 0 : savedProjects.length > 0

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void handleOpenFiles(Array.from(e.dataTransfer.files))
      }}
      className={[
        'mx-auto flex h-full w-full max-w-5xl flex-col gap-8 overflow-y-auto px-6 py-8',
        dragOver ? 'outline-dashed outline-2 outline-offset-[-8px] outline-[var(--color-accent)]' : '',
      ].join(' ')}
    >
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
        {t('스크린샷 프로젝트')}
      </h1>

      <section className="flex flex-wrap gap-4">
        {existingProject && (
          <StartCard
            label={t('계속 편집하기 →')}
            /* Same name the header shows: on the desktop that is the file's. */
            hint={docPath ? docNameFromPath(docPath) : existingProject.name}
            onClick={() => setStep(2)}
          >
            <span aria-hidden className="text-2xl text-[var(--color-accent-strong)]">
              ▸
            </span>
          </StartCard>
        )}
        <StartCard
          label={t('새 프로젝트')}
          hint={t('빈 슬라이드 한 장으로 시작합니다')}
          onClick={handleNew}
        >
          <span aria-hidden className="text-3xl font-light text-[var(--color-text-dim)]">
            +
          </span>
        </StartCard>
        {BUILTIN_PROJECT_TEMPLATES.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            label={t(tpl.label)}
            hint={t(tpl.description)}
            onStart={startFromTemplate}
          />
        ))}
        {userTemplates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            tpl={tpl}
            label={tpl.label}
            hint={t('내 템플릿')}
            onStart={startFromTemplate}
            onRemove={() => setConfirmRemove({ kind: 'template', id: tpl.id, label: tpl.label })}
          />
        ))}
        {/* Two cards on the desktop, one on the web. A file picked through the
            webview's own input arrives without a path, so opening a .studio.zip
            that way would fork a second file instead of opening the one on
            disk — the desktop needs the native picker for that. The web has no
            files at all, so there one card routes both kinds by what was
            picked (routeOpenFiles). The harness enters through that input, and
            it runs against the web build. */}
        <StartCard
          label={importBusy ? t('여는 중…') : t('프로젝트 열기')}
          hint={
            desktop ? t('⌘O — 저장해 둔 프로젝트 파일') : t('저장한 .studio.zip 또는 AI가 만든 파일 세트')
          }
          onClick={() => (desktop ? void pickAndOpen() : importInputRef.current?.click())}
          disabled={importBusy}
        >
          <span aria-hidden className="text-2xl text-[var(--color-text-dim)]">
            ⤓
          </span>
        </StartCard>
        {desktop && (
          <StartCard
            label={importBusy ? t('여는 중…') : t('파일 가져오기')}
            hint={t('AI가 만든 manifest + 스크린샷 + 캡션 파일 한 묶음')}
            onClick={() => importInputRef.current?.click()}
            disabled={importBusy}
          >
            <span aria-hidden className="text-2xl text-[var(--color-text-dim)]">
              ⇥
            </span>
          </StartCard>
        )}
      </section>

      <input
        ref={importInputRef}
        type="file"
        accept=".zip,.json,.csv,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void handleOpenFiles(files)
        }}
      />

      {ignoredOnOpen > 0 && (
        <p className="text-[length:var(--text-ui-xs)] text-[var(--color-warning)]">
          {t('프로젝트 파일을 열었습니다. 함께 고른 파일 {n}개는 사용하지 않았습니다.', {
            n: ignoredOnOpen,
          })}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-[length:var(--text-ui-sm)] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {t('내 프로젝트')}
        </h2>
        {!hasProjects ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
            <p className="text-[length:var(--text-ui)] text-[var(--color-text-dim)]">
              {t('아직 프로젝트가 없습니다. 위에서 하나 고르세요.')}
            </p>
            <p className="mt-1 text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
              {t('프로젝트 파일이나 스크린샷을 여기에 끌어다 놓아도 됩니다.')}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {desktop
              ? recents.map((entry) => (
                  <li key={entry.path}>
                    <ProjectCard
                      title={entry.name}
                      meta={
                        entry.missing
                          ? t('찾을 수 없음')
                          : `${t('{n}장', { n: entry.slideCount })}${entry.lastOpened ? ` · ${formatTime(entry.lastOpened)}` : ''}`
                      }
                      src={entry.preview ? `data:image/png;base64,${entry.preview}` : undefined}
                      disabled={entry.missing}
                      onOpen={() => void openRecent(entry.path)}
                      onRemove={entry.missing ? () => void forgetRecent(entry.path) : undefined}
                      removeLabel={t('목록에서 제거')}
                    />
                  </li>
                ))
              : savedProjects.map((p) => (
                  <li key={p.id}>
                    <LibraryCard
                      project={p}
                      onOpen={() => handleLoad(p)}
                      onRemove={() =>
                        setConfirmRemove({ kind: 'project', id: p.id, label: p.name })
                      }
                    />
                  </li>
                ))}
          </ul>
        )}
      </section>

      {confirmLoad && (
        <Modal title={t('프로젝트 불러오기')} onClose={cancelLoad}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {t('현재 편집 중인 작업을')}{' '}
            <span className="font-medium text-[var(--color-text)]">{confirmLoad.name}</span>
            {t('(으)로 교체합니다. 저장하지 않은 변경 사항은 사라집니다.')}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelLoad}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('취소')}
            </button>
            <button
              type="button"
              onClick={() => doLoad(confirmLoad)}
              className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
            >
              {t('불러오기')}
            </button>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <Modal title={t('삭제')} size="sm" onClose={() => setConfirmRemove(null)}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            <span className="font-medium text-[var(--color-text)]">{confirmRemove.label}</span>
            {t('을(를) 삭제합니다. 되돌릴 수 없습니다.')}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('취소')}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger-on)] hover:brightness-110"
            >
              {t('삭제 확인')}
            </button>
          </div>
        </Modal>
      )}

      {bundleError && (
        <Modal title={t('프로젝트 열기')} onClose={() => setBundleError(false)}>
          <p className="mt-2 text-sm text-[var(--color-danger)]">
            {t('프로젝트 파일을 열 수 없습니다. 올바른 프로젝트 .zip 파일인지 확인하세요.')}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setBundleError(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('닫기')}
            </button>
          </div>
        </Modal>
      )}

      {importResult && (
        <Modal title={t('프로젝트 가져오기')} onClose={cancelImport}>
          {importResult.project ? (
            <p className="mt-2 text-sm text-[var(--color-text)]">
              <span className="font-medium">{importResult.project.name}</span>
              <span className="text-[var(--color-text-dim)]">
                {' '}{t('— 슬라이드 {slides}장 · 스크린샷 {screenshots}개 · 외부 이미지 {externalImages}개 · 캡션 {captions}개 적용', { slides: importResult.applied.slides, screenshots: importResult.applied.screenshots, externalImages: importResult.applied.externalImages, captions: importResult.applied.captions })}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-danger)]">{t('가져올 수 없습니다.')}</p>
          )}
          {importResult.issues.length > 0 && (
            <details className="mt-2" open={!importResult.project}>
              <summary className="cursor-pointer text-xs text-[var(--color-danger)]">
                {t('경고 {n}건 보기', { n: importResult.issues.length })}
              </summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-5 pr-2 text-[11px] text-[var(--color-text-dim)]">
                {importResult.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {importResult.project && existingProject && (
            <p className="mt-3 text-xs text-[var(--color-text-dim)]">
              {t('가져오면 현재 편집 중인 프로젝트를 덮어씁니다. 저장하지 않은 변경 사항은 사라집니다.')}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelImport}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {importResult.project ? t('취소') : t('닫기')}
            </button>
            {importResult.project && (
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-md bg-[var(--color-accent-strong)] px-3 py-1.5 text-sm font-semibold text-[var(--color-accent-on)] hover:brightness-110"
              >
                {t('에디터에서 검수 →')}
              </button>
            )}
          </div>
        </Modal>
      )}

      {confirmNew && (
        <Modal title={t('새 프로젝트 만들기')} onClose={() => setConfirmNew(false)}>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            {t("현재 편집 중인 프로젝트를 새 프로젝트로 덮어씁니다. 저장하지 않은 변경 사항은 사라집니다. 먼저 '저장'으로 보관해 두면 나중에 다시 불러올 수 있습니다.")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmNew(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-text-dim)]"
            >
              {t('취소')}
            </button>
            <button
              type="button"
              onClick={doCreate}
              className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-semibold text-[var(--color-danger-on)] hover:brightness-110"
            >
              {t('새로 만들기')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** One tile in the "start something" row: a picture box with a label under it. */
function StartCard({
  label,
  hint,
  onClick,
  disabled,
  children,
}: {
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-40 flex-col gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] transition group-hover:border-[var(--color-accent)] group-focus-visible:border-[var(--color-accent)]">
        {children}
      </span>
      <span className="line-clamp-2 text-[length:var(--text-ui)] font-medium text-[var(--color-text)]">
        {label}
      </span>
      {hint && (
        <span className="line-clamp-2 text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
          {hint}
        </span>
      )}
    </button>
  )
}

/** A template tile — the picture is the template's own first slide, rendered. */
function TemplateCard({
  tpl,
  label,
  hint,
  onStart,
  onRemove,
}: {
  tpl: ProjectTemplate
  /** Built-ins go through the dictionary; a user's own template does not. */
  label: string
  hint: string
  onStart: (tpl: ProjectTemplate) => void
  onRemove?: () => void
}) {
  const t = useT()
  const project = useMemo(() => buildProjectFromTemplate(tpl, tpl.label), [tpl])
  const src = usePreview(`tpl:${tpl.id}`, project)
  return (
    <div className="group relative">
      <StartCard label={label} hint={hint} onClick={() => onStart(tpl)}>
        {src ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span aria-hidden className="text-2xl text-[var(--color-text-dim)]">
            ▦
          </span>
        )}
      </StartCard>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={t('삭제')}
          aria-label={t('삭제')}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-dim)] opacity-0 transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/** A web-library entry. Its preview is rendered here — only files cache one. */
function LibraryCard({
  project,
  onOpen,
  onRemove,
}: {
  project: Project
  onOpen: () => void
  onRemove: () => void
}) {
  const t = useT()
  const src = usePreview(`lib:${project.id}:${project.updatedAt}`, project)
  return (
    <ProjectCard
      title={project.name}
      meta={`${t('{n}장', { n: project.slides.length })} · ${formatTime(project.updatedAt)}`}
      src={src}
      onOpen={onOpen}
      onRemove={onRemove}
      removeLabel={t('삭제')}
    />
  )
}

/** A tile in the "my projects" grid: thumbnail, name, one line of detail. */
function ProjectCard({
  title,
  meta,
  src,
  disabled,
  onOpen,
  onRemove,
  removeLabel,
}: {
  title: string
  meta: string
  src?: string
  disabled?: boolean
  onOpen: () => void
  onRemove?: () => void
  removeLabel: string
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="flex w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition hover:border-[var(--color-accent)] focus-visible:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-32 w-full items-center justify-center bg-[var(--color-surface-2)] p-2">
          {src && <img src={src} alt="" className="max-h-full max-w-full object-contain" />}
        </span>
        <span className="flex flex-col gap-0.5 border-t border-[var(--color-border)] px-3 py-2">
          <span className="truncate text-[length:var(--text-ui)] font-medium text-[var(--color-text)]">
            {title}
          </span>
          <span className="truncate text-[length:var(--text-ui-xs)] text-[var(--color-text-dim)]">
            {meta}
          </span>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={removeLabel}
          aria-label={removeLabel}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-dim)] opacity-0 transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/**
 * Render a project's first slide into a data URL, once per key. Rendering is a
 * Fabric canvas spin-up, so the result is cached for the life of the tab.
 */
function usePreview(key: string, project: Project): string | undefined {
  // The cache is the state; the effect only fills it and asks for a repaint.
  // Reading it during render keeps a key change from showing the old picture.
  const [, repaint] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (previewCache.has(key)) return
    let alive = true
    void projectPreview(project).then((b64) => {
      if (!b64) return
      previewCache.set(key, `data:image/png;base64,${b64}`)
      if (alive) repaint()
    })
    return () => {
      alive = false
    }
  }, [key, project])
  return previewCache.get(key)
}
