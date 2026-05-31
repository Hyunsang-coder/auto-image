import { describe, expect, it } from 'vitest'
import { DEVICE_SPECS, deviceSpecOf, detectDeviceFromAspect } from './deviceSpecs'

describe('detectDeviceFromAspect', () => {
  it('buckets portrait phone aspects as iPhone', () => {
    // iPhone 6.5" ≈ 0.462
    expect(detectDeviceFromAspect(1284, 2778)).toBe('iphone-16-pro')
  })

  it('buckets tablet / near-square aspects as iPad', () => {
    // iPad Pro 12.9" ≈ 0.750
    expect(detectDeviceFromAspect(2048, 2732)).toBe('ipad-pro-13')
  })

  it('splits exactly at the 0.6 midpoint', () => {
    expect(detectDeviceFromAspect(59, 100)).toBe('iphone-16-pro') // 0.59 < 0.6
    expect(detectDeviceFromAspect(60, 100)).toBe('ipad-pro-13') // 0.60 ≥ 0.6
  })

  it('treats landscape as iPad (iPhone landscape is not a target)', () => {
    expect(detectDeviceFromAspect(2778, 1284)).toBe('ipad-pro-13')
  })
})

describe('deviceSpecOf', () => {
  it('maps device type to its single canonical model', () => {
    expect(deviceSpecOf('iphone')).toBe(DEVICE_SPECS['iphone-16-pro'])
    expect(deviceSpecOf('ipad')).toBe(DEVICE_SPECS['ipad-pro-13'])
  })
})
