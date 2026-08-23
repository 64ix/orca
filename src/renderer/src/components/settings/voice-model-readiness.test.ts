import { describe, expect, it } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { SpeechModelState } from '../../../../shared/speech-types'
import { hasReadyVoiceModel } from './voice-model-readiness'

function modelState(id: string, status: SpeechModelState['status']): SpeechModelState {
  return { id, status } as SpeechModelState
}

function settingsWith(sttModel: string): GlobalSettings {
  return {
    voice: { sttModel },
    terminalScrollbackRows: 5_000
  } as unknown as GlobalSettings
}

describe('hasReadyVoiceModel', () => {
  it('is true when the preferred speech model is ready', () => {
    const states = [modelState('m1', 'downloading'), modelState('m2', 'ready')]
    expect(hasReadyVoiceModel(settingsWith('m2'), states)).toBe(true)
  })

  it('falls back to any ready model when the preferred one is not ready', () => {
    const states = [modelState('preferred', 'error'), modelState('other', 'ready')]
    expect(hasReadyVoiceModel(settingsWith('preferred'), states)).toBe(true)
  })

  it('falls back to any ready model when no preference is set', () => {
    const states = [modelState('a', 'ready')]
    expect(hasReadyVoiceModel(settingsWith(''), states)).toBe(true)
  })

  it('is false when nothing is ready', () => {
    const states = [modelState('a', 'not-downloaded')]
    expect(hasReadyVoiceModel(settingsWith(''), states)).toBe(false)
  })
})
