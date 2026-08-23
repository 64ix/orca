import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { SpeechModelState } from '../../../../shared/speech-types'
import { getDefaultVoiceSettings } from '../../../../shared/constants'

export function hasReadyVoiceModel(
  settings: GlobalSettings,
  modelStates: readonly SpeechModelState[]
): boolean {
  const voiceSettings = settings.voice ?? getDefaultVoiceSettings()
  if (
    voiceSettings.sttModel !== '' &&
    modelStates.some((state) => state.id === voiceSettings.sttModel && state.status === 'ready')
  ) {
    return true
  }
  return modelStates.some((state) => state.status === 'ready')
}
