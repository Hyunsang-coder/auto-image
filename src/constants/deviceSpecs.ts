import type { DeviceType, DeviceModel } from '../types/project'

export interface DeviceSpec {
  type: DeviceType
  model: DeviceModel
  label: string
  exportWidth: number
  exportHeight: number
  cornerRadius: number
  screenInsetRatio: number
  hasIsland: boolean
}

// Every resolution here is an App Store Connect-accepted portrait screenshot
// size. Apple requires only the largest per type (iPhone 6.9", iPad 13") and
// auto-scales smaller devices from it; the rest are offered for users who want
// to ship a tailored set. cornerRadius is in export px and scales to the
// rendered device width (templateLayouts), so it just needs to be proportional.
export const DEVICE_SPECS: Record<DeviceModel, DeviceSpec> = {
  'iphone-16-pro': {
    type: 'iphone',
    model: 'iphone-16-pro',
    label: 'iPhone 6.9"',
    exportWidth: 1320,
    exportHeight: 2868,
    cornerRadius: 206,
    screenInsetRatio: 0.020,
    hasIsland: true,
  },
  'iphone-6-5': {
    type: 'iphone',
    model: 'iphone-6-5',
    label: 'iPhone 6.5"',
    exportWidth: 1242,
    exportHeight: 2688,
    cornerRadius: 194,
    screenInsetRatio: 0.020,
    hasIsland: true,
  },
  'ipad-pro-13': {
    type: 'ipad',
    model: 'ipad-pro-13',
    label: 'iPad 13"',
    exportWidth: 2064,
    exportHeight: 2752,
    cornerRadius: 81,
    screenInsetRatio: 0.046,
    hasIsland: false,
  },
  'ipad-12-9': {
    type: 'ipad',
    model: 'ipad-12-9',
    label: 'iPad 12.9"',
    exportWidth: 2048,
    exportHeight: 2732,
    cornerRadius: 80,
    screenInsetRatio: 0.046,
    hasIsland: false,
  },
  'ipad-11': {
    type: 'ipad',
    model: 'ipad-11',
    label: 'iPad 11"',
    exportWidth: 1668,
    exportHeight: 2388,
    cornerRadius: 65,
    screenInsetRatio: 0.050,
    hasIsland: false,
  },
}

// Default (largest, App Store-required) model for each device type — the
// fallback when a project hasn't picked a size.
export const DEFAULT_MODEL: Record<DeviceType, DeviceModel> = {
  iphone: 'iphone-16-pro',
  ipad: 'ipad-pro-13',
}

export const MODELS_BY_TYPE: Record<DeviceType, DeviceModel[]> = {
  iphone: ['iphone-16-pro', 'iphone-6-5'],
  ipad: ['ipad-pro-13', 'ipad-12-9', 'ipad-11'],
}

export function typeOfModel(model: DeviceModel): DeviceType {
  return DEVICE_SPECS[model].type
}

export function deviceSpecOf(type: DeviceType): DeviceSpec {
  return DEVICE_SPECS[DEFAULT_MODEL[type]]
}

// iPhone portrait aspect ≈ 0.46; iPad ≈ 0.75. Midpoint at ~0.60 cleanly
// separates portrait phones (always < 0.55) from tablets and near-square shots
// (≥ 0.65). Anything wider than 1 is landscape and buckets as iPad — iPhone
// landscape isn't a target. The size within the type comes from the project.
export function detectTypeFromAspect(width: number, height: number): DeviceType {
  return width / height < 0.6 ? 'iphone' : 'ipad'
}

export const EDITOR_CANVAS_WIDTH = 440
