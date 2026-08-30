import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { safeLocalStorage } from './safeStorage'
import { checkForUpdate, isTauri, type UpdateCheck } from './tauri'

// The app makes no other network call, so this one is the user's to switch off.
const AUTO_KEY = 'update-check-on-launch'

export function useUpdateCheck() {
  const [result, setResult] = useState<UpdateCheck | null>(null)
  const [auto, setAutoState] = useState(() => safeLocalStorage.getItem(AUTO_KEY) !== 'off')
  /** Feedback for a check the user asked for — a silent one says nothing. */
  const [message, setMessage] = useState('')
  const timer = useRef(0)

  const check = useCallback(async (manual: boolean) => {
    if (manual) setMessage(t('업데이트 확인 중…'))
    try {
      const found = await checkForUpdate()
      setResult(found)
      if (manual && found) {
        setMessage(found.newer ? '' : t('최신 버전입니다 ({v})', { v: found.current }))
      }
    } catch {
      if (manual) setMessage(t('업데이트 확인 실패 — 네트워크를 확인하세요'))
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(''), 4000)
  }, [])

  // Launch check only: re-running it when the switch flips would make turning it
  // *on* fire a request the user didn't ask for. Reading the preference here
  // rather than off `auto` keeps that true.
  //
  // Deferred a beat so a slow network can't sit in front of the first paint —
  // nothing in the app waits on this answer.
  useEffect(() => {
    if (!isTauri() || safeLocalStorage.getItem(AUTO_KEY) === 'off') return
    const id = window.setTimeout(() => void check(false), 1200)
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(timer.current)
    }
  }, [check])

  const setAuto = useCallback((on: boolean) => {
    setAutoState(on)
    safeLocalStorage.setItem(AUTO_KEY, on ? 'on' : 'off')
  }, [])

  return { update: result, message, auto, setAuto, check: () => void check(true) }
}
