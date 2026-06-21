import { useRef, useState } from 'react'
import type { Background, DeviceType, DeviceModel, Project } from '../../types/project'
import { DEFAULT_BACKGROUND } from '../../constants/defaults'
import { DEVICE_SPECS, MODELS_BY_TYPE, DEFAULT_MODEL } from '../../constants/deviceSpecs'
import { useProjectStore } from '../../store/useProjectStore'
import { useLibraryStore } from '../../store/useLibraryStore'
import { useCustomStore } from '../../store/useCustomStore'
import { allReferencedImageKeys, gcImages } from '../../lib/imageRefs'
import { pruneOrphanImages } from '../../lib/imageStore'
import { runProjectImport, type ImportRunResult } from '../../lib/projectImportRun'
import { importProjectBundle } from '../../lib/projectBundle'
import { BackgroundPanel } from '../editor/properties/BackgroundPanel'
import { BUILTIN_PROJECT_TEMPLATES, buildProjectFromTemplate, type ProjectTemplate } from '../../constants/projectTemplates'
import { Modal } from '../common/Modal'
import { useT } from '../../i18n'

const MIN_SLIDES = 1
const MAX_SLIDES = 10

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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingTplDelete, setPendingTplDelete] = useState<string | null>(null)
  const [confirmLoad, setConfirmLoad] = useState<Project | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState<ImportRunResult | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const bundleInputRef = useRef<HTMLInputElement>(null)
  const [bundleError, setBundleError] = useState(false)

  const [name, setName] = useState(existingProject?.name ?? t('내 앱'))
  // Exactly one device type per project (radio, never both/neither). The chosen
  // App Store size per type is picked here too and seeds project.deviceModels.
  const [device, setDevice] = useState<DeviceType>(
    existingProject?.devices?.[0] ?? 'iphone',
  )
  const [deviceModel, setDeviceModel] = useState<Record<DeviceType, DeviceModel>>({
    iphone: existingProject?.deviceModels?.iphone ?? DEFAULT_MODEL.iphone,
    ipad: existingProject?.deviceModels?.ipad ?? DEFAULT_MODEL.ipad,
  })
  const [count, setCount] = useState<number>(
    existingProject?.screenshotCount ?? 5,
  )
  const [themeBackground, setThemeBackground] = useState<Background>(
    existingProject?.themeBackground ?? structuredClone(DEFAULT_BACKGROUND),
  )

  const canSubmit = name.trim().length > 0
  const hasExisting = !!existingProject

  function submit() {
    if (!canSubmit) return
    // Creating a fresh project overwrites the active one — confirm first, like
    // load/delete do, since this is the most destructive path here.
    if (existingProject) {
      setConfirmNew(true)
      return
    }
    doCreate()
  }

  function doCreate() {
    createProject({
      name: name.trim(),
      devices: [device],
      deviceModels: { [device]: deviceModel[device] },
      screenshotCount: count,
      themeBackground,
    })
    setConfirmNew(false)
  }

  function handleDelete(id: string) {
    removeProject(id)
    setPendingDelete(null)
    // Sweep any image blobs the deleted project no longer keeps alive.
    pruneOrphanImages(allReferencedImageKeys())
  }

  function handleLoad(p: Project) {
    // Loading replaces the active project. Confirm first if there's current
    // work that hasn't been explicitly saved into the library as-is.
    if (existingProject) {
      setConfirmLoad(p)
      return
    }
    doLoad(p)
  }

  function doLoad(p: Project) {
    loadProject(p)
    setConfirmLoad(null)
    // The outgoing project's blobs are swept if nothing else references them.
    gcImages()
  }

  // Starting from a template builds a fresh project, then routes through the
  // same load path (so it confirms before overwriting current work).
  function startFromTemplate(tpl: ProjectTemplate) {
    handleLoad(buildProjectFromTemplate(tpl, name))
  }

  // The import runs uncommitted, then one modal shows the summary/warnings and
  // doubles as the overwrite confirmation. Cancel sweeps the blobs the dry run
  // already persisted to IndexedDB (unreferenced → gcImages collects them).
  async function handleImportFiles(files: File[]) {
    setImportBusy(true)
    try {
      setImportResult(await runProjectImport(files))
    } finally {
      setImportBusy(false)
    }
  }

  function confirmImport() {
    if (!importResult?.project) return
    loadProject(importResult.project)
    setImportResult(null)
    gcImages()
  }

  function cancelImport() {
    setImportResult(null)
    gcImages()
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

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)]">
          {t('새 스크린샷 프로젝트')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          {t('App Store 제출용 스크린샷 세트를 만듭니다. 데이터는 이 브라우저에만 저장됩니다.')}
        </p>
      </header>

      {!hasExisting && savedProjects.length === 0 && <FirstRunIntro />}

      {(BUILTIN_PROJECT_TEMPLATES.length > 0 || userTemplates.length > 0) && (
        <Section
          title={t('템플릿으로 시작')}
          hint={t('여러 슬라이드로 구성된 시작 세트입니다. 고르면 바로 편집 단계로 들어갑니다.')}
        >
          <ul className="flex flex-col gap-2">
            {BUILTIN_PROJECT_TEMPLATES.map((tpl) => (
              <li
                key={tpl.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {t(tpl.label)}
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {t(tpl.description)} · {t('{n}장', { n: tpl.slides.length })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startFromTemplate(tpl)}
                  className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  {t('이 템플릿으로 시작 →')}
                </button>
              </li>
            ))}
            {userTemplates.map((tpl) => (
              <li
                key={tpl.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {tpl.label}
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {tpl.description} · {t('내 템플릿')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startFromTemplate(tpl)}
                    className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    {t('시작 →')}
                  </button>
                  {pendingTplDelete === tpl.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          removeProjectTemplate(tpl.id)
                          setPendingTplDelete(null)
                        }}
                        className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        {t('삭제 확인')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingTplDelete(null)}
                        className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs hover:border-[var(--color-text-dim)]"
                      >
                        {t('취소')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingTplDelete(tpl.id)}
                      className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-red-400 hover:text-red-400"
                    >
                      {t('삭제')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title={t('프로젝트 가져오기')}
        hint={t('AI 에이전트가 준비한 파일들(manifest.json + 스크린샷 + 캡션 CSV/JSON)을 한 번에 선택하면 export 전 단계까지 채워진 프로젝트로 시작합니다.')}
      >
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.csv,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) void handleImportFiles(files)
          }}
        />
        <button
          type="button"
          disabled={importBusy}
          onClick={() => importInputRef.current?.click()}
          className="self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importBusy ? t('가져오는 중…') : t('파일 선택')}
        </button>
      </Section>

      <Section
        title={t('프로젝트 파일 열기')}
        hint={t('이전에 저장한 프로젝트 파일(.zip)을 열어 이어서 편집합니다. 스크린샷과 모든 편집 내용이 그대로 복원됩니다.')}
      >
        <input
          ref={bundleInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void handleOpenBundle(file)
          }}
        />
        <button
          type="button"
          disabled={importBusy}
          onClick={() => bundleInputRef.current?.click()}
          className="self-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importBusy ? t('가져오는 중…') : t('파일 선택')}
        </button>
      </Section>

      <Section title={t('앱 이름')}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          placeholder={t('예: Dogo, Claude, ADHD')}
        />
      </Section>

      <Section
        title={t('기기')}
        hint={t('한 종류만 선택합니다. 사이즈는 App Store에 등록 가능한 해상도입니다.')}
      >
        <div className="flex flex-wrap gap-3">
          {(['iphone', 'ipad'] as DeviceType[]).map((d) => {
            const active = device === d
            const model = deviceModel[d]
            const spec = DEVICE_SPECS[model]
            return (
              <div
                key={d}
                onClick={() => setDevice(d)}
                className={[
                  'flex flex-1 min-w-[200px] cursor-pointer flex-col items-start gap-2 rounded-xl border px-4 py-3 text-left transition',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-text-dim)]',
                ].join(' ')}
              >
                <span className="text-base font-medium text-[var(--color-text)]">
                  {d === 'iphone' ? 'iPhone' : 'iPad'}
                </span>
                {active ? (
                  <select
                    value={model}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setDeviceModel((m) => ({ ...m, [d]: e.target.value as DeviceModel }))
                    }
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  >
                    {MODELS_BY_TYPE[d].map((mm) => (
                      <option key={mm} value={mm}>
                        {DEVICE_SPECS[mm].label} · {DEVICE_SPECS[mm].exportWidth}×
                        {DEVICE_SPECS[mm].exportHeight}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-[var(--color-text-dim)]">
                    {spec.label} · {spec.exportWidth} × {spec.exportHeight} px
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title={t('슬라이드 수')} hint={t('1~10장. 나중에 추가할 수도 있습니다.')}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(MIN_SLIDES, c - 1))}
            className="h-10 w-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-lg leading-none hover:bg-[var(--color-border)]"
          >
            −
          </button>
          <input
            type="number"
            value={count}
            min={MIN_SLIDES}
            max={MAX_SLIDES}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10)
              if (Number.isNaN(v)) return
              setCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, v)))
            }}
            className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-center text-base text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(MAX_SLIDES, c + 1))}
            className="h-10 w-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-lg leading-none hover:bg-[var(--color-border)]"
          >
            +
          </button>
          <span className="text-sm text-[var(--color-text-dim)]">{t('장')}</span>
        </div>
      </Section>

      <Section title={t('기본 배경')} hint={t('모든 슬라이드의 기본 배경으로 사용됩니다.')}>
        <BackgroundPanel value={themeBackground} onChange={setThemeBackground} />
      </Section>

      <footer className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <p className="text-xs text-[var(--color-text-dim)]">
          {hasExisting
            ? t('계속하면 기존 프로젝트를 덮어씁니다.')
            : t('저장은 자동으로 이루어집니다.')}
        </p>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-accent)]/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasExisting ? t('새로 만들기 →') : t('다음 →')}
        </button>
      </footer>

      {hasExisting && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
          <p className="mb-2 text-[var(--color-text-dim)]">
            {t('이전에 만들던 프로젝트가 있습니다:')}
          </p>
          <p className="text-[var(--color-text)]">
            <span className="font-medium">{existingProject.name}</span>
            <span className="ml-2 text-[var(--color-text-dim)]">
              · {t('{n}장', { n: existingProject.slides.length })} · {t('마지막 수정')} {formatTime(existingProject.updatedAt)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-3 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-text-dim)]"
          >
            {t('계속 편집하기 →')}
          </button>
        </div>
      )}

      {savedProjects.length > 0 && (
        <Section title={t('저장된 프로젝트')} hint={t("헤더의 '저장'으로 보관한 프로젝트입니다.")}>
          <ul className="flex flex-col gap-2">
            {savedProjects.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {p.name}
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {t('{n}장', { n: p.slides.length })} · {formatTime(p.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoad(p)}
                    className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs hover:border-[var(--color-text-dim)]"
                  >
                    {t('불러오기')}
                  </button>
                  {pendingDelete === p.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="rounded-md bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
                      >
                        {t('삭제 확인')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(null)}
                        className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs hover:border-[var(--color-text-dim)]"
                      >
                        {t('취소')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(p.id)}
                      className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-dim)] hover:border-red-400 hover:text-red-400"
                    >
                      {t('삭제')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

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
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
              >
                {t('불러오기')}
              </button>
            </div>
        </Modal>
      )}

      {bundleError && (
        <Modal title={t('프로젝트 파일 열기')} onClose={() => setBundleError(false)}>
            <p className="mt-2 text-sm text-red-600">
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
                {' '}{t('— 슬라이드 {slides}장 · 스크린샷 {screenshots}개 · 캡션 {captions}개 적용', { slides: importResult.applied.slides, screenshots: importResult.applied.screenshots, captions: importResult.applied.captions })}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-red-600">{t('가져올 수 없습니다.')}</p>
          )}
          {importResult.issues.length > 0 && (
            <details className="mt-2" open={!importResult.project}>
              <summary className="cursor-pointer text-xs text-red-600">
                {t('경고 {n}건 보기', { n: importResult.issues.length })}
              </summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1 pl-5 pr-2 text-[11px] text-[var(--color-text-dim)]">
                {importResult.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </details>
          )}
          {importResult.project && hasExisting && (
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
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110"
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
                className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                {t('새로 만들기')}
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}

function FirstRunIntro() {
  const t = useT()
  const steps = [
    { n: 1, label: '설정', desc: '기기 · 슬라이드 수 · 테마' },
    { n: 2, label: '편집', desc: '스크린샷 올리고 문구 · 디자인' },
    { n: 3, label: '현지화', desc: '언어별 문구 · 스크린샷' },
    { n: 4, label: '내보내기', desc: 'PNG ZIP (App Store 규격)' },
  ]
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="mb-3 text-sm text-[var(--color-text)]">{t('처음이신가요? 4단계로 만듭니다:')}</p>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="flex flex-col gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-xs font-semibold text-[var(--color-accent)]">
              {s.n}
            </span>
            <span className="text-sm font-medium text-[var(--color-text)]">{t(s.label)}</span>
            <span className="text-xs text-[var(--color-text-dim)]">{t(s.desc)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          {title}
        </h2>
        {hint && (
          <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{hint}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}
