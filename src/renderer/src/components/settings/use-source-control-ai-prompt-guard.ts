import { useCallback, useEffect, useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type {
  SourceControlAiSettings,
  SourceControlAiSettingsPatch
} from '../../../../shared/source-control-ai-types'
import { normalizeSourceControlAiSettings } from '../../../../shared/source-control-ai'
import { useAppStore } from '../../store'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { isIntentionalAppRestartInProgress } from '@/lib/updater-beforeunload'
import { registerWindowCloseGuard } from '../window-close-request-coordinator'
import { translate } from '@/i18n/i18n'

function readSourceControlAiSettings(settings: GlobalSettings): SourceControlAiSettings {
  return normalizeSourceControlAiSettings(settings.sourceControlAi, settings.commitMessageAi)
}

type UseSourceControlAiPromptGuardParams = {
  settings: GlobalSettings | null
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
  closeSettingsPage: () => void
}

/**
 * Owns the Git AI Author unsaved-changes lifecycle: dirty flags per pane, the serialized
 * write queue, the discard confirmation, and the window close guard.
 */
export function useSourceControlAiPromptGuard({
  settings,
  updateSettings,
  closeSettingsPage
}: UseSourceControlAiPromptGuardParams) {
  const confirm = useConfirmationDialog()
  const [hasUnsavedCommitPromptChanges, setHasUnsavedCommitPromptChanges] = useState(false)
  const [hasUnsavedBranchPromptChanges, setHasUnsavedBranchPromptChanges] = useState(false)
  const [sourceControlAiPromptDiscardSignal, setSourceControlAiPromptDiscardSignal] = useState(0)
  const sourceControlAiWriteQueueRef = useRef<Promise<void>>(Promise.resolve())

  const hasUnsavedSourceControlAiPromptChanges =
    hasUnsavedCommitPromptChanges || hasUnsavedBranchPromptChanges
  // Why: the close guard registers once, so it reads latest dirty state from a ref instead of a lagging closure.
  const hasUnsavedSourceControlAiPromptChangesRef = useRef(hasUnsavedSourceControlAiPromptChanges)
  hasUnsavedSourceControlAiPromptChangesRef.current = hasUnsavedSourceControlAiPromptChanges

  const writeSourceControlAiSettings = useCallback(
    (patch: SourceControlAiSettingsPatch): Promise<void> => {
      const next = sourceControlAiWriteQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const latestSettings = useAppStore.getState().settings ?? settings
          if (!latestSettings) {
            return
          }
          const latestConfig = readSourceControlAiSettings(latestSettings)
          const resolvedPatch = typeof patch === 'function' ? patch(latestConfig) : patch
          await updateSettings({ sourceControlAi: { ...latestConfig, ...resolvedPatch } })
        })
      sourceControlAiWriteQueueRef.current = next
      return next
    },
    [settings, updateSettings]
  )

  // Pure prompt (no side effects): the close guard must ask without clearing drafts, since a later guard can still cancel the close.
  const promptDiscardSourceControlAiPromptChanges = useCallback((): Promise<boolean> => {
    return confirm({
      title: translate(
        'auto.components.settings.Settings.17bdee4ff1',
        'Discard unsaved Git AI Author changes?'
      ),
      description: translate(
        'auto.components.settings.Settings.43b68e10f0',
        'You have unsaved Git AI Author changes. Leaving will discard them.'
      ),
      confirmLabel: translate('auto.components.settings.Settings.65358016ea', 'Discard'),
      confirmVariant: 'destructive'
    })
  }, [confirm])

  const confirmDiscardSourceControlAiPromptChanges = useCallback(async (): Promise<boolean> => {
    if (!hasUnsavedSourceControlAiPromptChanges) {
      return true
    }
    const shouldDiscard = await promptDiscardSourceControlAiPromptChanges()
    if (shouldDiscard) {
      setSourceControlAiPromptDiscardSignal((signal) => signal + 1)
      setHasUnsavedCommitPromptChanges(false)
      setHasUnsavedBranchPromptChanges(false)
    }
    return shouldDiscard
  }, [promptDiscardSourceControlAiPromptChanges, hasUnsavedSourceControlAiPromptChanges])

  const closeSettingsPageWithPromptGuard = useCallback(async (): Promise<void> => {
    if (!(await confirmDiscardSourceControlAiPromptChanges())) {
      return
    }
    closeSettingsPage()
  }, [closeSettingsPage, confirmDiscardSourceControlAiPromptChanges])

  // Why: route window close/quit through the discard dialog; a bare beforeunload veto shows no UI and reads as an unquittable window.
  useEffect(() => {
    return registerWindowCloseGuard(() => {
      if (isIntentionalAppRestartInProgress()) {
        return true
      }
      if (!hasUnsavedSourceControlAiPromptChangesRef.current) {
        return true
      }
      return promptDiscardSourceControlAiPromptChanges()
    })
  }, [promptDiscardSourceControlAiPromptChanges])

  return {
    hasUnsavedCommitPromptChanges,
    setHasUnsavedCommitPromptChanges,
    hasUnsavedBranchPromptChanges,
    setHasUnsavedBranchPromptChanges,
    sourceControlAiPromptDiscardSignal,
    hasUnsavedSourceControlAiPromptChanges,
    writeSourceControlAiSettings,
    promptDiscardSourceControlAiPromptChanges,
    confirmDiscardSourceControlAiPromptChanges,
    closeSettingsPageWithPromptGuard
  }
}
