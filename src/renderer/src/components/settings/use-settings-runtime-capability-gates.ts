import { useMemo } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  isWindowsTerminalCapabilityHost,
  useLocalWindowsTerminalCapabilities,
  useWindowsTerminalCapabilities
} from '@/lib/windows-terminal-capabilities'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { useWindowsTerminalCapabilityOwnerKey } from '@/hooks/useWindowsTerminalCapabilityOwnerKey'

type UseSettingsRuntimeCapabilityGatesParams = {
  settings: GlobalSettings | null
  isWindows: boolean
  isWebClient: boolean
  neededSectionIds: ReadonlySet<string>
}

/**
 * Decides which Windows/WSL capability sets Settings must load for the sections being
 * rendered, and which host's capabilities each pane should consume.
 */
export function useSettingsRuntimeCapabilityGates({
  settings,
  isWindows,
  isWebClient,
  neededSectionIds
}: UseSettingsRuntimeCapabilityGatesParams) {
  const windowsTerminalCapabilityOwnerKey = useWindowsTerminalCapabilityOwnerKey(
    settings?.activeRuntimeEnvironmentId
  )
  const runtimeTarget = useMemo(() => getActiveRuntimeTarget(settings), [settings])
  const capabilityLoadTarget = useMemo(
    () => (isWebClient ? { kind: 'local' as const } : runtimeTarget),
    [isWebClient, runtimeTarget]
  )
  const hasActiveRuntimeEnvironment = Boolean(settings?.activeRuntimeEnvironmentId?.trim())
  const needsRepoWindowsRuntimeCapabilities = [...neededSectionIds].some((sectionId) =>
    sectionId.startsWith('repo-')
  )
  const needsLocalWindowsRuntimeCapabilities =
    (isWindows || isWebClient) &&
    (neededSectionIds.has('agents') || neededSectionIds.has('general'))
  const shouldLoadWindowsTerminalCapabilities =
    hasActiveRuntimeEnvironment ||
    ((isWindows || isWebClient) &&
      (neededSectionIds.has('terminal') ||
        neededSectionIds.has('accounts') ||
        needsRepoWindowsRuntimeCapabilities ||
        (runtimeTarget.kind === 'local' && needsLocalWindowsRuntimeCapabilities)))
  // Why: terminal, account, and repository settings describe the active execution host.
  const windowsTerminalCapabilities = useWindowsTerminalCapabilities(
    shouldLoadWindowsTerminalCapabilities,
    true,
    windowsTerminalCapabilityOwnerKey,
    capabilityLoadTarget
  )
  // Why: global agent and project defaults belong to the desktop, not its active remote.
  const remoteViewLocalWindowsRuntimeCapabilities = useLocalWindowsTerminalCapabilities(
    needsLocalWindowsRuntimeCapabilities && runtimeTarget.kind === 'environment' && !isWebClient,
    true,
    'local'
  )
  const localWindowsRuntimeCapabilities =
    runtimeTarget.kind === 'local' || isWebClient
      ? windowsTerminalCapabilities
      : remoteViewLocalWindowsRuntimeCapabilities
  // Why: only supported-but-unavailable WSL (Windows) should render disabled controls, not unsupported WSL (macOS/Linux).
  const runtimeWslSupportedPlatform = isWindowsTerminalCapabilityHost({
    isWindowsRenderer: isWindows,
    isWebClient,
    target: runtimeTarget,
    hostPlatform: windowsTerminalCapabilities.hostPlatform
  })
  const localWslSupportedPlatform = isWindowsTerminalCapabilityHost({
    isWindowsRenderer: isWindows,
    isWebClient,
    target: { kind: 'local' },
    hostPlatform: localWindowsRuntimeCapabilities.hostPlatform
  })
  return {
    windowsTerminalCapabilities,
    localWindowsRuntimeCapabilities,
    runtimeWslSupportedPlatform,
    localWslSupportedPlatform,
    isWindowsTerminalHost: runtimeWslSupportedPlatform
  }
}
