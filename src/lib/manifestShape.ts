// Shape test that decides whether a JSON file is an import manifest (vs a
// caption template). Kept in its own dependency-free module so the headless
// layout-loop script can import the SAME classifier the app uses under bare
// node, without pulling in the full projectImport graph.

export function isManifestShaped(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    Array.isArray((value as { slides?: unknown }).slides)
  )
}
