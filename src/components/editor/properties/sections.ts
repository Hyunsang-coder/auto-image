/**
 * Inspector sections. The panel shows exactly one — whichever the current
 * selection belongs to — so this list is no longer a tab strip; it is the
 * vocabulary shared by the panel header and the layer panel's add menu (the
 * only way to reach a section whose layer has no instance yet).
 */
export type PanelTab =
  | 'background'
  | 'caption'
  | 'screenshot'
  | 'externalImages'
  | 'badge'
  | 'ornaments'
  | 'shapes'
  | 'highlights'

export const PANEL_SECTIONS: { id: PanelTab; label: string }[] = [
  { id: 'background', label: '배경' },
  { id: 'caption', label: '텍스트' },
  { id: 'screenshot', label: '디바이스' },
  { id: 'externalImages', label: '이미지' },
  { id: 'highlights', label: '하이라이트' },
  { id: 'shapes', label: '도형' },
  { id: 'ornaments', label: '장식' },
  { id: 'badge', label: '배지' },
]

export const sectionLabel = (id: PanelTab): string =>
  PANEL_SECTIONS.find((x) => x.id === id)?.label ?? '배경'
