import { describe, expect, it } from 'vitest'
import {
  DEVICE_SPECS,
  DEFAULT_MODEL,
  MODELS_BY_TYPE,
  deviceSpecOf,
  detectTypeFromAspect,
  typeOfModel,
} from './deviceSpecs'

describe('detectTypeFromAspect', () => {
  it('buckets portrait phone aspects as iPhone', () => {
    expect(detectTypeFromAspect(1284, 2778)).toBe('iphone') // ≈ 0.462
  })

  it('buckets tablet / near-square aspects as iPad', () => {
    expect(detectTypeFromAspect(2048, 2732)).toBe('ipad') // ≈ 0.750
  })

  it('splits exactly at the 0.6 midpoint', () => {
    expect(detectTypeFromAspect(59, 100)).toBe('iphone') // 0.59 < 0.6
    expect(detectTypeFromAspect(60, 100)).toBe('ipad') // 0.60 ≥ 0.6
  })

  it('treats landscape as iPad (iPhone landscape is not a target)', () => {
    expect(detectTypeFromAspect(2778, 1284)).toBe('ipad')
  })
})

describe('deviceSpecOf / typeOfModel', () => {
  it('maps a device type to its default (largest, required) model spec', () => {
    expect(deviceSpecOf('iphone')).toBe(DEVICE_SPECS[DEFAULT_MODEL.iphone])
    expect(deviceSpecOf('ipad')).toBe(DEVICE_SPECS[DEFAULT_MODEL.ipad])
  })

  it('every model reports the type it belongs to', () => {
    for (const model of MODELS_BY_TYPE.iphone) expect(typeOfModel(model)).toBe('iphone')
    for (const model of MODELS_BY_TYPE.ipad) expect(typeOfModel(model)).toBe('ipad')
  })

  it('MODELS_BY_TYPE covers every spec exactly once', () => {
    const grouped = [...MODELS_BY_TYPE.iphone, ...MODELS_BY_TYPE.ipad].sort()
    expect(grouped).toEqual(Object.keys(DEVICE_SPECS).sort())
  })
})
