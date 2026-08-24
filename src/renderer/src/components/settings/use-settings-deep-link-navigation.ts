import { useEffect, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import {
  getSettingsTargetHostSelection,
  resolveSettingsTargetRepoId,
  type SettingsProject,
  type buildRepoIdToHostSelection
} from './settings-project-list'
import type {
  SettingsNavSection,
  SettingsNavTarget,
  SettingsNavigationTarget
} from '@/lib/settings-navigation-types'
import { useAppStore } from '../../store'
import { resolveAppearanceAccordionDeepLink } from './appearance-usage-percentage-search'
import {
  cancelPendingSettingsSubsectionScrollFrame,
  getSettingsScrollTarget,
  scrollSubsectionIntoView
} from './settings-section-scroll'

const SETTINGS_TARGET_HIGHLIGHT_MS = 3_000

/** Resolves a nav target to the rendered section id: repo targets map to their project's representative pane. */
export function getSettingsSectionId(
  pane: SettingsNavTarget,
  repoId: string | null,
  repoIdToRepresentative: Map<string, string>
) {
  if (pane === 'repo' && repoId) {
    // Why: Settings renders one collapsed pane per project, so resolve a repoId target to its project's representative section.
    return `repo-${repoIdToRepresentative.get(repoId) ?? repoId}`
  }
  return pane
}

type RepoHostSelection =
  ReturnType<typeof buildRepoIdToHostSelection> extends Map<string, infer Selection>
    ? Selection
    : never

type UseSettingsDeepLinkNavigationParams = {
  settings: GlobalSettings | null
  settingsNavigationTarget: SettingsNavigationTarget | null
  clearSettingsTarget: () => void
  setSettingsProjectHostSelection: (
    projectId: string,
    hostId: ExecutionHostId,
    setupId?: string
  ) => void
  repoIdToRepresentative: Map<string, string>
  repoIdToHostSelection: Map<string, RepoHostSelection>
  settingsProjectList: readonly SettingsProject[]
  visibleSectionIds: Set<string>
  visibleNavSections: readonly SettingsNavSection[]
  activeSectionId: string
  setActiveSectionId: (sectionId: string) => void
  settingsSearchQuery: string
  setSettingsSearchQuery: (query: string) => void
  contentScrollRef: RefObject<HTMLDivElement | null>
  pendingNavSectionRef: MutableRefObject<string | null>
  pendingScrollTargetRef: MutableRefObject<string | null>
  pendingSubsectionScrollFrameRef: MutableRefObject<number | null>
}

/**
 * Consumes cross-page deep links into Settings: resolves the target section, selects the
 * owning project host, bumps one-shot "add" intents, then scrolls/highlights after render.
 */
export function useSettingsDeepLinkNavigation({
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
}: UseSettingsDeepLinkNavigationParams): {
  highlightedSettingsTargetId: string | null
  quickCommandAddIntentSignal: number
  sshHostAddIntentSignal: number
  remoteServerAddIntentSignal: number
  requestSubsectionJump: (sectionId: string) => void
} {
  const [highlightedSettingsTargetId, setHighlightedSettingsTargetId] = useState<string | null>(
    null
  )
  const [pendingNavRequestTick, setPendingNavRequestTick] = useState(0)
  const [quickCommandAddIntentSignal, setQuickCommandAddIntentSignal] = useState(0)
  const [sshHostAddIntentSignal, setSshHostAddIntentSignal] = useState(0)
  const [remoteServerAddIntentSignal, setRemoteServerAddIntentSignal] = useState(0)

  useEffect(() => {
    if (!highlightedSettingsTargetId) {
      return
    }
    const timeout = window.setTimeout(
      () => setHighlightedSettingsTargetId(null),
      SETTINGS_TARGET_HIGHLIGHT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [highlightedSettingsTargetId])

  useEffect(() => {
    if (!settings || !settingsNavigationTarget) {
      return
    }

    const paneSectionId = getSettingsSectionId(
      settingsNavigationTarget.pane,
      settingsNavigationTarget.repoId ?? null,
      repoIdToRepresentative
    )
    // Why: select the target repo's host before scrolling so its host-specific subsection anchor renders and the scroll lands.
    const targetRepoId = resolveSettingsTargetRepoId(
      settingsNavigationTarget,
      repoIdToHostSelection.keys()
    )
    if (targetRepoId) {
      const hostSelection = settingsNavigationTarget.hostId
        ? getSettingsTargetHostSelection(
            settingsProjectList,
            targetRepoId,
            settingsNavigationTarget.hostId
          )
        : repoIdToHostSelection.get(targetRepoId)
      if (hostSelection) {
        setSettingsProjectHostSelection(
          hostSelection.projectId,
          hostSelection.hostId,
          'setupId' in hostSelection && typeof hostSelection.setupId === 'string'
            ? hostSelection.setupId
            : undefined
        )
      }
    }
    pendingNavSectionRef.current = paneSectionId
    pendingScrollTargetRef.current = settingsNavigationTarget.sectionId ?? paneSectionId
    setHighlightedSettingsTargetId(
      settingsNavigationTarget.pane === 'developer-permissions'
        ? (settingsNavigationTarget.sectionId ?? null)
        : null
    )
    // Why: ensure Appearance's nested status-bar section is open before scrolling so the row is visible.
    if (settingsNavigationTarget.pane === 'appearance') {
      const accordion = resolveAppearanceAccordionDeepLink(settingsNavigationTarget.sectionId)
      if (accordion) {
        useAppStore.getState().setAppearanceAccordionDeepLink(accordion)
      }
    }
    if (settingsNavigationTarget.intent === 'add-quick-command') {
      setQuickCommandAddIntentSignal((signal) => signal + 1)
    } else if (settingsNavigationTarget.intent === 'add-ssh-host') {
      setSshHostAddIntentSignal((signal) => signal + 1)
    } else if (settingsNavigationTarget.intent === 'add-remote-orca-server') {
      setRemoteServerAddIntentSignal((signal) => signal + 1)
    }
    // Why: bump state so the scroll effect runs even when the visible section set is unchanged (target kept in refs).
    setPendingNavRequestTick((tick) => tick + 1)
    clearSettingsTarget()
  }, [
    clearSettingsTarget,
    pendingNavSectionRef,
    pendingScrollTargetRef,
    repoIdToHostSelection,
    repoIdToRepresentative,
    setSettingsProjectHostSelection,
    settings,
    settingsNavigationTarget,
    settingsProjectList
  ])

  useEffect(() => {
    const scrollTargetId = pendingScrollTargetRef.current
    const pendingNavSectionId = pendingNavSectionRef.current

    // Why: subsection deep links clear a stale filter that could hide the target row; pane-level links keep it to force-open the matching section.
    if (
      scrollTargetId &&
      pendingNavSectionId &&
      scrollTargetId !== pendingNavSectionId &&
      settingsSearchQuery.trim() !== ''
    ) {
      setSettingsSearchQuery('')
      return
    }

    if (scrollTargetId && pendingNavSectionId && visibleSectionIds.has(pendingNavSectionId)) {
      // Why: inactive panes don't render; activate the pane first, then find the subsection next render.
      if (activeSectionId !== pendingNavSectionId) {
        setActiveSectionId(pendingNavSectionId)
        return
      }
      const container = contentScrollRef.current
      if (container) {
        container.scrollTo({ top: 0 })
      }
      // Why: deep links can target a row inside the already-visible pane.
      if (scrollTargetId !== pendingNavSectionId) {
        // Why: target can arrive before the lazy section mounts; keep pending refs until it does.
        if (!getSettingsScrollTarget(scrollTargetId, container)) {
          return
        }
        const scrollToSubsection = (): void => {
          scrollSubsectionIntoView(scrollTargetId, contentScrollRef.current)
        }
        scrollToSubsection()
        cancelPendingSettingsSubsectionScrollFrame(pendingSubsectionScrollFrameRef)
        let completed = false
        let frameId: number | undefined
        frameId = requestAnimationFrame(() => {
          completed = true
          if (pendingSubsectionScrollFrameRef.current === frameId) {
            pendingSubsectionScrollFrameRef.current = null
          }
          scrollToSubsection()
        })
        if (!completed) {
          pendingSubsectionScrollFrameRef.current = frameId
        }
      }
      setActiveSectionId(pendingNavSectionId)
      pendingNavSectionRef.current = null
      pendingScrollTargetRef.current = null
      return
    }

    if (!visibleSectionIds.has(activeSectionId) && visibleNavSections.length > 0) {
      setActiveSectionId(visibleNavSections.at(0)?.id ?? activeSectionId)
    }
  }, [
    activeSectionId,
    contentScrollRef,
    pendingNavRequestTick,
    pendingNavSectionRef,
    pendingScrollTargetRef,
    pendingSubsectionScrollFrameRef,
    setActiveSectionId,
    setSettingsSearchQuery,
    settingsSearchQuery,
    visibleNavSections,
    visibleSectionIds
  ])

  const requestSubsectionJump = (sectionId: string): void => {
    pendingNavSectionRef.current = sectionId
    pendingScrollTargetRef.current = sectionId
    // Why: pending refs don't schedule a render; bump state to rerun the jump effect.
    setPendingNavRequestTick((tick) => tick + 1)
  }

  // Why: cancel pending subsection jumps when the page closes so a stale frame can't run after unmount.
  useEffect(() => {
    return () => {
      cancelPendingSettingsSubsectionScrollFrame(pendingSubsectionScrollFrameRef)
    }
  }, [pendingSubsectionScrollFrameRef])

  return {
    highlightedSettingsTargetId,
    quickCommandAddIntentSignal,
    sshHostAddIntentSignal,
    remoteServerAddIntentSignal,
    requestSubsectionJump
  }
}
