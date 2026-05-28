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
    label: 'iPhone 16 Pro Max (6.9")',
    exportWidth: 1320,
    exportHeight: 2868,
    cornerRadius: 200,
    screenInsetRatio: 0.020,
    hasIsland: true,
  },
  'ipad-pro-13': {
    type: 'ipad',
    model: 'ipad-pro-13',
    label: 'iPad Pro 13" (M4)',
    exportWidth: 2064,
    exportHeight: 2752,
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

export const EDITOR_CANVAS_WIDTH = 440
