// Export-step preview width by the user's preview-size setting (1 small … 5
// large). Full export resolution makes a preview byte-identical to the PNG
// (absolute-pixel constants diverge at any other scale), but costs a full
// render per slide on step entry plus a duplicate at export time — so only the
// largest size pays it. Anything else renders capped and stays a layout check.
export function previewRenderWidth(previewSize: number): number | undefined {
  switch (previewSize) {
    case 1:
      return 320
    case 2:
      return 480
    case 3:
      return 660
    case 4:
      return 900
    default:
      return undefined
  }
}
