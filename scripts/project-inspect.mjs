#!/usr/bin/env node
// Inspect a .studio.zip bundle without launching the editor. Produces a compact
// JSON summary for agents: slide ids, editable paths, image references, and
// structural issues that should be fixed with project:patch before rendering.
//
//   npm run project:inspect -- <project.studio.zip> [out.json] [--extract-images <dir>]

import JSZip from 'jszip'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'

const MANIFEST = 'project.json'

const args = process.argv.slice(2)
const extractIndex = args.indexOf('--extract-images')
const extractDir = extractIndex >= 0 ? args[extractIndex + 1] : undefined
const positional = args.filter((arg, index) => {
  if (arg === '--extract-images') return false
  if (extractIndex >= 0 && index === extractIndex + 1) return false
  return !arg.startsWith('--')
})
const [inArg, outArg] = positional

if (!inArg) {
  console.error('Usage: npm run project:inspect -- <project.studio.zip> [out.json] [--extract-images <dir>]')
  process.exit(2)
}
if (extractIndex >= 0 && !extractDir) {
  console.error('--extract-images requires a directory')
  process.exit(2)
}

function typeOfModel(model) {
  return String(model ?? '').startsWith('ipad') ? 'ipad' : 'iphone'
}

function imageExt(path) {
  const ext = extname(path ?? '').slice(1).toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  return ext || 'bin'
}

function screenshotRefs(slide, sourceLocale) {
  const refs = []
  if (!slide.screenshot) return refs
  refs.push({ key: slide.screenshot.imageKey, filename: `${slide.index + 1}.${sourceLocale}.${imageExt('x.png')}`, role: 'base' })
  for (const [locale, shot] of Object.entries(slide.screenshot.localeOverrides ?? {})) {
    refs.push({ key: shot.imageKey, filename: `${slide.index + 1}.${locale}.${imageExt('x.png')}`, role: `locale:${locale}` })
  }
  return refs
}

function externalRefs(slide) {
  return (slide.externalImages ?? []).map((image, index) => ({
    key: image.imageKey,
    filename: `${slide.index + 1}-external-${index + 1}.${imageExt('x.png')}`,
    role: `external:${index}`,
  }))
}

function bgImageKey(bg) {
  return bg?.type === 'image' ? bg.imageKey : undefined
}

function inspectBundle(bundle) {
  const project = bundle.project
  const images = bundle.images ?? {}
  const issues = []
  const spanGroups = new Map()

  for (const slide of project.slides ?? []) {
    if (!slide.spanGroupId) continue
    const members = spanGroups.get(slide.spanGroupId) ?? []
    members.push(slide)
    spanGroups.set(slide.spanGroupId, members)
  }
  for (const [groupId, members] of spanGroups) {
    const leader = members.find((s) => s.spanRole === 'leader')
    const follower = members.find((s) => s.spanRole === 'follower')
    if (members.length !== 2 || !leader || !follower || follower.index !== leader.index + 1) {
      issues.push(`span ${groupId}: expected adjacent leader/follower pair`)
    }
  }

  const imageRefs = []
  const slides = (project.slides ?? []).map((slide) => {
    const slideIssues = []
    if ((slide.externalImages ?? []).length > 3) slideIssues.push('externalImages exceeds max 3')
    if (slide.spanRole === 'follower' && (slide.externalImages ?? []).length) {
      slideIssues.push('externalImages on a span follower are ignored while grouped')
    }
    if (slide.background?.type === 'image' && !bgImageKey(slide.background)) slideIssues.push('image background missing imageKey')

    const refs = [
      ...screenshotRefs(slide, project.sourceLocale),
      ...externalRefs(slide),
      ...(bgImageKey(slide.background) ? [{ key: bgImageKey(slide.background), filename: `${slide.index + 1}-background.${imageExt('x.png')}`, role: 'background' }] : []),
    ]
    for (const ref of refs) {
      const path = images[ref.key]
      const filename = ref.filename.replace(/\.[^.]+$/, `.${imageExt(path ?? ref.filename)}`)
      const missing = !path
      imageRefs.push({ ...ref, filename, slide: slide.index + 1, bundlePath: path ?? null, missing })
      if (missing) slideIssues.push(`missing image blob for ${ref.role} (${ref.key})`)
    }

    if (slideIssues.length) issues.push(...slideIssues.map((issue) => `slide ${slide.index + 1}: ${issue}`))
    return {
      number: slide.index + 1,
      id: slide.id,
      template: slide.template,
      span: slide.spanGroupId ? { groupId: slide.spanGroupId, role: slide.spanRole } : null,
      device: {
        model: slide.deviceFrame?.model,
        type: typeOfModel(slide.deviceFrame?.model),
        frameModel: slide.deviceFrame?.frameModel ?? null,
        showFrame: slide.deviceFrame?.show === true,
      },
      screenshot: slide.screenshot
        ? {
            imageKey: slide.screenshot.imageKey,
            overrides: Object.keys(slide.screenshot.localeOverrides ?? {}),
            localeSource: slide.screenshot.localeSource ?? {},
          }
        : null,
      counts: {
        texts: slide.texts?.length ?? 0,
        badges: slide.badges?.length ?? 0,
        ornaments: slide.ornaments?.length ?? 0,
        externalImages: slide.externalImages?.length ?? 0,
        highlights: slide.highlights?.length ?? 0,
      },
      externalImages: (slide.externalImages ?? []).map((image, index) => ({
        index,
        id: image.id,
        imageKey: image.imageKey,
        x: image.x,
        y: image.y,
        width: image.width,
        rotation: image.rotation,
        opacity: image.opacity,
        cornerRadiusRatio: image.cornerRadiusRatio,
        shadow: image.shadow,
        crop: image.crop ?? null,
      })),
      patchHints: {
        text: (slide.texts ?? []).map((_, i) => `texts[${i}]`),
        externalImages: (slide.externalImages ?? []).map((_, i) => `externalImages[${i}]`),
      },
      issues: slideIssues,
    }
  })

  return {
    bundleVersion: bundle.bundleVersion,
    schemaVersion: bundle.schemaVersion ?? null,
    project: {
      id: project.id,
      name: project.name,
      sourceLocale: project.sourceLocale,
      targetLocales: project.targetLocales ?? [],
      devices: project.devices ?? [],
      deviceModels: project.deviceModels ?? {},
      slideCount: project.slides?.length ?? 0,
      updatedAt: project.updatedAt ?? null,
    },
    slides,
    imageRefs,
    imagePlan: {
      screenshots: imageRefs.filter((ref) => ref.role === 'base' || ref.role.startsWith('locale:')).map((ref) => ref.filename),
      externalImages: imageRefs.filter((ref) => ref.role.startsWith('external:')).map((ref) => ref.filename),
    },
    issues,
  }
}

const zip = await JSZip.loadAsync(await readFile(resolve(inArg)))
const manifestFile = zip.file(MANIFEST)
if (!manifestFile) {
  console.error(`not a project bundle: ${MANIFEST} missing in ${inArg}`)
  process.exit(1)
}
const bundle = JSON.parse(await manifestFile.async('string'))
if (!bundle.project) {
  console.error('malformed bundle: no project')
  process.exit(1)
}

const result = inspectBundle(bundle)

if (extractDir) {
  await mkdir(resolve(extractDir), { recursive: true })
  for (const ref of result.imageRefs) {
    if (!ref.bundlePath) continue
    const entry = zip.file(ref.bundlePath)
    if (!entry) continue
    await writeFile(join(resolve(extractDir), ref.filename), Buffer.from(await entry.async('uint8array')))
  }
}

const json = JSON.stringify(result, null, 2)
if (outArg) {
  await writeFile(resolve(outArg), json)
  console.log(`:: inspected ${basename(inArg)} → ${outArg}${extractDir ? `, extracted images → ${extractDir}` : ''}`)
} else {
  console.log(json)
}
