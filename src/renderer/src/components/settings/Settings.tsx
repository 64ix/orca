import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import { useAppStore } from '../../store'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { isMacUserAgent, isWindowsUserAgent } from '@/components/terminal-pane/pane-helpers'
import { applyDocumentTheme } from '@/lib/document-theme'
import { SCROLLBACK_PRESETS_ROWS } from './SettingsConstants'
import { useGhosttyImport } from './useGhosttyImport'
import { useWarpThemeImport } from './useWarpThemeImport'
import { SettingsSidebar } from './SettingsSidebar'
import {
  buildRepoIdToHostSelection,
  buildRepoIdToRepresentative,
  buildSettingsProjectList,
  getSettingsProjectHostRepo,
  removeSettingsProjectFromAllHosts
} from './settings-project-list'
import { getInitialMountedSectionIds } from './settings-load-performance'
import { isWebClientLocation } from '@/hooks/useSettingsNavigationMetadata'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getRepoHostIdentity } from '../../store/slices/repo-host-identity'
import { useSourceControlAiPromptGuard } from './use-source-control-ai-prompt-guard'
import { useSettingsDeepLinkNavigation } from './use-settings-deep-link-navigation'
import { useSettingsEscapeClose } from './use-settings-escape-close'
import { useRepoHooksInspection } from './use-repo-hooks-inspection'
import { useSettingsNavModel } from './use-settings-nav-model'
import { useSettingsRuntimeCapabilityGates } from './use-settings-runtime-capability-gates'
import { useSettingsSearchShortcut } from './use-settings-search-shortcut'
import { useTerminalFontSuggestions } from './use-terminal-font-suggestions'
import { AllSettingsSections } from './AllSettingsSections'

function Settings(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const keybindings = useAppStore((s) => s.keybindings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const updateSettingsOrThrow = useAppStore((s) => s.updateSettingsOrThrow)
  const setActiveRuntimeEnvironmentPreference = useAppStore(
    (s) => s.setActiveRuntimeEnvironmentPreference
  )
  const fetchSettings = useAppStore((s) => s.fetchSettings)
  const fetchKeybindings = useAppStore((s) => s.fetchKeybindings)
  const closeSettingsPage = useAppStore((s) => s.closeSettingsPage)
  const repos = useAppStore((s) => s.repos)
  const projects = useAppStore((s) => s.projects)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const updateProject = useAppStore((s) => s.updateProject)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const settingsNavigationTarget = useAppStore((s) => s.settingsNavigationTarget)
  const clearSettingsTarget = useAppStore((s) => s.clearSettingsTarget)
  const settingsProjectHostSelection = useAppStore((s) => s.settingsProjectHostSelection)
  const settingsProjectSetupSelection = useAppStore((s) => s.settingsProjectSetupSelection)
  const setSettingsProjectHostSelection = useAppStore((s) => s.setSettingsProjectHostSelection)
  const settingsSearchInputQuery = useAppStore((s) => s.settingsSearchInputQuery)
  const settingsSearchQuery = useAppStore((s) => s.settingsSearchQuery)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)

  // Why: one entry per project (derived from repos to match nav metadata) — the source of truth for the pane list.
  const settingsProjectList = useMemo(() => buildSettingsProjectList(repos), [repos])
  const repoIdToRepresentative = useMemo(
    () => buildRepoIdToRepresentative(settingsProjectList),
    [settingsProjectList]
  )
  // Why: lets a deep-link's repoId select the owning project's host so host-specific subsection anchors exist.
  const repoIdToHostSelection = useMemo(
    () => buildRepoIdToHostSelection(settingsProjectList),
    [settingsProjectList]
  )
  // Why: pane-level "Remove Project" removes every host setup, not just the selected host (per-host remove lives in "Available Hosts").
  const removeProjectAllHosts = useCallback(
    (setups: readonly ProjectHostSetup[]): Promise<void> =>
      removeSettingsProjectFromAllHosts(setups, useAppStore.getState().removeProject),
    []
  )

  const systemPrefersDark = useSystemPrefersDark()
  const isWindows = isWindowsUserAgent()
  const isMac = isMacUserAgent()
  const isWebClient = isWebClientLocation()
  const showDesktopOnlySettings = !isWebClient
  // Why: keep Ghostty import state at Settings level so the modal survives section remounts.
  const ghostty = useGhosttyImport(updateSettings, settings)
  const warpThemes = useWarpThemeImport(updateSettings, settings)
  const { fontSuggestions, terminalFontSuggestions, requestFontSuggestions } =
    useTerminalFontSuggestions()
  const [activeSectionId, setActiveSectionId] = useState('general')
  const [mountedSectionIds, setMountedSectionIds] = useState<Set<string>>(
    getInitialMountedSectionIds
  )
  // Why: session-only (deliberately not persisted) unlock — Shift-click the Experimental entry reveals the hidden group.
  const [hiddenExperimentalUnlocked, setHiddenExperimentalUnlocked] = useState(false)
  const [scrollbackMode, setScrollbackMode] = useState<'preset' | 'custom'>('preset')
  const [prevScrollbackRows, setPrevScrollbackRows] = useState(settings?.terminalScrollbackRows)
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const pendingNavSectionRef = useRef<string | null>(null)
  const pendingScrollTargetRef = useRef<string | null>(null)
  const pendingSubsectionScrollFrameRef = useRef<number | null>(null)

  const {
    hasUnsavedBranchPromptChanges,
    setHasUnsavedBranchPromptChanges,
    setHasUnsavedCommitPromptChanges,
    sourceControlAiPromptDiscardSignal,
    hasUnsavedSourceControlAiPromptChanges,
    writeSourceControlAiSettings,
    confirmDiscardSourceControlAiPromptChanges,
    closeSettingsPageWithPromptGuard
  } = useSourceControlAiPromptGuard({ settings, updateSettings, closeSettingsPage })

  const setSettingsRootNode = useCallback(
    (node: HTMLDivElement | null): void => {
      if (node) {
        return
      }
      // Why: clear the transient search filter on close, else the next visit opens with whole sections still hidden.
      setSettingsSearchQuery('')
    },
    [setSettingsSearchQuery]
  )

  useEffect(() => {
    fetchSettings()
    fetchKeybindings()
  }, [fetchKeybindings, fetchSettings])

  useSettingsEscapeClose(activeSectionId, closeSettingsPageWithPromptGuard)
  useSettingsSearchShortcut(keybindings, searchInputRef)

  // Why: recompute scrollback mode only when the row value changes, not on every settings mutation.
  if (settings?.terminalScrollbackRows !== prevScrollbackRows) {
    setPrevScrollbackRows(settings?.terminalScrollbackRows)
    if (settings) {
      setScrollbackMode(
        SCROLLBACK_PRESETS_ROWS.includes(
          settings.terminalScrollbackRows as (typeof SCROLLBACK_PRESETS_ROWS)[number]
        )
          ? 'preset'
          : 'custom'
      )
    }
  }

  const applyTheme = useCallback((theme: 'system' | 'dark' | 'light') => {
    applyDocumentTheme(theme)
  }, [])

  const {
    linearConnected,
    visibleNavSections,
    visibleSectionIds,
    neededSectionIds,
    getSectionSearchEntries,
    isSectionMounted,
    generalNavGroups,
    repoNavSections
  } = useSettingsNavModel({
    settings,
    repos,
    activeSectionId,
    settingsSearchQuery,
    mountedSectionIds,
    setMountedSectionIds,
    pendingNavSectionRef,
    hasUnsavedSourceControlAiPromptChanges
  })

  const {
    windowsTerminalCapabilities,
    localWindowsRuntimeCapabilities,
    runtimeWslSupportedPlatform,
    localWslSupportedPlatform,
    isWindowsTerminalHost
  } = useSettingsRuntimeCapabilityGates({ settings, isWindows, isWebClient, neededSectionIds })

  // Why: load hooks for the selected host's repo id, not the representative id (they differ for non-default hosts).
  const neededRepos = useMemo(() => {
    const reposByHostIdentity = new Map<string, (typeof repos)[number]>()
    for (const settingsProject of settingsProjectList) {
      if (!neededSectionIds.has(`repo-${settingsProject.representativeRepoId}`)) {
        continue
      }
      const repo = getSettingsProjectHostRepo(
        settingsProject,
        repos,
        settingsProjectHostSelection[settingsProject.projectId],
        settingsProjectSetupSelection[settingsProject.projectId]
      )
      if (repo) {
        reposByHostIdentity.set(getRepoHostIdentity(repo), repo)
      }
    }
    return [...reposByHostIdentity.values()]
  }, [
    neededSectionIds,
    repos,
    settingsProjectHostSelection,
    settingsProjectList,
    settingsProjectSetupSelection
  ])

  const repoHooksMap = useRepoHooksInspection(repos, neededRepos)

  const {
    highlightedSettingsTargetId,
    quickCommandAddIntentSignal,
    sshHostAddIntentSignal,
    remoteServerAddIntentSignal,
    requestSubsectionJump
  } = useSettingsDeepLinkNavigation({
    settings,
    settingsNavigationTarget,
    clearSettingsTarget,
    setSettingsProjectHostSelection,
    repoIdToRepresentative,
    repoIdToHostSelection,
    settingsProjectList,
    visibleSectionIds,
    visibleNavSections,
    activeSectionId,
    setActiveSectionId,
    settingsSearchQuery,
    setSettingsSearchQuery,
    contentScrollRef,
    pendingNavSectionRef,
    pendingScrollTargetRef,
    pendingSubsectionScrollFrameRef
  })

  const scrollToSection = useCallback(
    async (
      sectionId: string,
      modifiers?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
    ): Promise<void> => {
      if (sectionId !== activeSectionId && !(await confirmDiscardSourceControlAiPromptChanges())) {
        return
      }
      // Why: Shift-click the Experimental row unlocks the hidden power-user group (session-only).
      if (sectionId === 'experimental' && modifiers?.shiftKey) {
        setHiddenExperimentalUnlocked((previous) => !previous)
      }
      const container = contentScrollRef.current
      if (container) {
        container.scrollTo({ top: 0 })
      }
      if (settingsSearchQuery.trim() !== '') {
        // Why: clear the search filter so selecting a result shows that pane, not the stale query's.
        setSettingsSearchQuery('')
      }
      setActiveSectionId(sectionId)
    },
    [
      activeSectionId,
      confirmDiscardSourceControlAiPromptChanges,
      setSettingsSearchQuery,
      settingsSearchQuery
    ]
  )

  const openComputerUseFromBrowser = useCallback(async () => {
    if (!(await confirmDiscardSourceControlAiPromptChanges())) {
      return
    }
    if (settingsSearchQuery !== '') {
      setSettingsSearchQuery('')
    }
    requestSubsectionJump('computer-use')
  }, [
    confirmDiscardSourceControlAiPromptChanges,
    requestSubsectionJump,
    setSettingsSearchQuery,
    settingsSearchQuery
  ])

  if (!settings) {
    return (
      <div
        ref={setSettingsRootNode}
        className="settings-view-shell flex min-h-0 flex-1 overflow-hidden bg-background"
      >
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {translate('auto.components.settings.Settings.c7ad095d96', 'Loading settings...')}
        </div>
      </div>
    )
  }

  const isFocusedShortcutsPane =
    activeSectionId === 'shortcuts' && settingsSearchQuery.trim() === ''
  const isFocusedSetupGuidePane =
    activeSectionId === 'setup-guide' && settingsSearchQuery.trim() === ''

  return (
    <div
      ref={setSettingsRootNode}
      className="settings-view-shell flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <SettingsSidebar
        settings={settings}
        activeSectionId={activeSectionId}
        generalGroups={generalNavGroups}
        repoSections={repoNavSections}
        hasRepos={repos.length > 0}
        searchQuery={settingsSearchInputQuery}
        searchInputRef={searchInputRef}
        // Why: deep-links open panes/modals that own focus; plain entry lands in search.
        searchAutoFocus={settingsNavigationTarget == null}
        onBack={closeSettingsPageWithPromptGuard}
        onSearchChange={setSettingsSearchQuery}
        onSelectSection={scrollToSection}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={contentScrollRef}
          className={cn(
            'min-h-0 flex-1',
            isFocusedShortcutsPane ? 'overflow-hidden' : 'overflow-y-auto scrollbar-sleek'
          )}
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-10 px-8 pt-10',
              isFocusedShortcutsPane ? 'h-full pb-6' : 'pb-24',
              isFocusedSetupGuidePane ? 'max-w-6xl' : 'max-w-4xl'
            )}
          >
            {visibleNavSections.length === 0 ? (
              <div className="flex min-h-[24rem] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 text-sm text-muted-foreground">
                {translate(
                  'auto.components.settings.Settings.3c88ec55d6',
                  'No settings found for "'
                )}
                {settingsSearchQuery.trim()}
                {translate('auto.components.settings.Settings.add3b97ee6', '"')}
              </div>
            ) : (
              <AllSettingsSections
                {...{
                  activeSectionId,
                  settings,
                  updateSettings,
                  updateSettingsOrThrow,
                  getSectionSearchEntries,
                  isSectionMounted,
                  showDesktopOnlySettings,
                  linearConnected,
                  localWslSupportedPlatform,
                  runtimeWslSupportedPlatform,
                  localWindowsRuntimeCapabilities,
                  windowsTerminalCapabilities,
                  writeSourceControlAiSettings,
                  displayedGitUsername: repos[0]?.gitUsername ?? '',
                  hasUnsavedSourceControlAiPromptChanges,
                  hasUnsavedBranchPromptChanges,
                  onBranchPromptDirtyChange: setHasUnsavedBranchPromptChanges,
                  onCommitPromptDirtyChange: setHasUnsavedCommitPromptChanges,
                  sourceControlAiPromptDiscardSignal,
                  settingsSearchQuery,
                  scrollbackMode,
                  setScrollbackMode,
                  isWindowsTerminalHost,
                  quickCommandAddIntentSignal,
                  terminalFontSuggestions,
                  onRequestFontSuggestions: requestFontSuggestions,
                  onOpenComputerUseFromBrowser: openComputerUseFromBrowser,
                  applyTheme,
                  fontSuggestions,
                  systemPrefersDark,
                  ghostty,
                  warpThemes,
                  isFocusedShortcutsPane,
                  isMac,
                  isWebClient,
                  setActiveRuntimeEnvironmentPreference,
                  remoteServerAddIntentSignal,
                  sshHostAddIntentSignal,
                  highlightedSettingsTargetId,
                  hiddenExperimentalUnlocked,
                  repos,
                  projects,
                  projectHostSetups,
                  settingsProjectList,
                  settingsProjectHostSelection,
                  settingsProjectSetupSelection,
                  repoHooksMap,
                  updateRepo,
                  updateProject,
                  removeSettingsProjectFromAllHosts: removeProjectAllHosts
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
