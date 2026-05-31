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

export const DEVICE_SPECS: Record<DeviceModel, DeviceSpec> = {
  'iphone-16-pro': {
    type: 'iphone',
    model: 'iphone-16-pro',
    label: 'iPhone 6.5" (13 Pro Max)',
    exportWidth: 1284,
    exportHeight: 2778,
    cornerRadius: 200,
    screenInsetRatio: 0.020,
    hasIsland: true,
  },
  'ipad-pro-13': {
    type: 'ipad',
    model: 'ipad-pro-13',
    label: 'iPad Pro 12.9"',
    exportWidth: 2048,
    exportHeight: 2732,
    cornerRadius: 80,
    screenInsetRatio: 0.046,
    hasIsland: false,
  },
}

export function deviceSpecOf(type: DeviceType): DeviceSpec {
  return type === 'iphone'
    ? DEVICE_SPECS['iphone-16-pro']
    : DEVICE_SPECS['ipad-pro-13']
}

// iPhone 6.5" aspect ≈ 0.462; iPad Pro 12.9" ≈ 0.750.
// Midpoint at ~0.60 cleanly separates portrait phones (always < 0.55) from
// tablets and near-square shots (≥ 0.65). Anything wider than 1 is landscape
// and gets bucketed as iPad — iPhone landscape isn't a target.
export function detectDeviceFromAspect(width: number, height: number): DeviceModel {
  const aspect = width / height
  return aspect < 0.6 ? 'iphone-16-pro' : 'ipad-pro-13'
}

export const EDITOR_CANVAS_WIDTH = 440
