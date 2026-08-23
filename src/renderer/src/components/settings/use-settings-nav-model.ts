import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import {
  COMPUTER_USE_SKILL_NAME,
  LINEAR_AGENT_SKILL_NAMES,
  ORCHESTRATION_SKILL_NAME
} from '@/lib/agent-feature-install-commands'
import {
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  useInstalledAgentSkill,
  useInstalledAgentSkillNames
} from '@/hooks/useInstalledAgentSkills'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { useLinearProviderConnected } from '@/hooks/useLinearProviderConnected'
import { useSkillFreshness } from '@/hooks/useSkillFreshness'
import {
  isWebClientLocation,
  useSettingsNavigationMetadata
} from '@/hooks/useSettingsNavigationMetadata'
import type { SettingsNavGroup, SettingsNavInstallStatus } from '@/lib/settings-navigation-types'
import {
  getSettingsSectionSearchEntries,
  rankSettingsSearchItems,
  type SettingsSearchEntry
} from './settings-search'
import { deriveNeededSectionIds } from './settings-load-performance'
import { getSettingsNavGroupDefinitionsForSearch } from './settings-nav-group-definitions'
import {
  getAgentSkillNavInstallStatus,
  getLinearAgentSkillNavInstallStatus
} from '@/lib/agent-skill-nav-install-status'
import { hasReadyVoiceModel } from './voice-model-readiness'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'

type UseSettingsNavModelParams = {
  settings: GlobalSettings | null
  repos: readonly Repo[]
  activeSectionId: string
  settingsSearchQuery: string
  mountedSectionIds: Set<string>
  setMountedSectionIds: Dispatch<SetStateAction<Set<string>>>
  pendingNavSectionRef: MutableRefObject<string | null>
  hasUnsavedSourceControlAiPromptChanges: boolean
}

/**
 * The Settings navigation model: which sections exist, their install badges, which match the
 * search query, which are mounted, and how they group into sidebar entries.
 */
export function useSettingsNavModel({
  settings,
  repos,
  activeSectionId,
  settingsSearchQuery,
  mountedSectionIds,
  setMountedSectionIds,
  pendingNavSectionRef,
  hasUnsavedSourceControlAiPromptChanges
}: UseSettingsNavModelParams) {
  const isWebClient = isWebClientLocation()
  const showDesktopOnlySettings = !isWebClient
  // Why: mirror the nav registry's gate so the Linear sidebar entry and section appear/disappear together.
  const linearConnected = useLinearProviderConnected()
  const activeSkillRuntime = useActiveProjectSkillRuntime()
  const orchestrationSkill = useInstalledAgentSkill(ORCHESTRATION_SKILL_NAME, {
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const linearSkill = useInstalledAgentSkillNames(LINEAR_AGENT_SKILL_NAMES, {
    enabled: linearConnected,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const computerUseSkill = useInstalledAgentSkill(COMPUTER_USE_SKILL_NAME, {
    enabled: showDesktopOnlySettings,
    discoveryTarget: activeSkillRuntime.discoveryTarget,
    sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
  })
  const skillFreshnessApplies = activeSkillRuntime.canUseLocalSkillFreshness
  const { inventory: skillFreshnessInventory } = useSkillFreshness(skillFreshnessApplies)
  const [voiceModelStatesLoading, setVoiceModelStatesLoading] = useState(showDesktopOnlySettings)
  const modelStates = useAppStore((s) => s.modelStates)
  const refreshModelStates = useAppStore((s) => s.refreshModelStates)

  useEffect(() => {
    if (!showDesktopOnlySettings) {
      setVoiceModelStatesLoading(false)
      return
    }
    let canceled = false
    // Why: modelStates starts empty, so Voice shouldn't look missing before the first speech-model scan reports state.
    setVoiceModelStatesLoading(true)
    void refreshModelStates().finally(() => {
      if (!canceled) {
        setVoiceModelStatesLoading(false)
      }
    })
    return () => {
      canceled = true
    }
  }, [refreshModelStates, showDesktopOnlySettings])

  const capabilityInstallStatusBySectionId = useMemo(() => {
    const applicableFreshnessInventory = skillFreshnessApplies ? skillFreshnessInventory : null
    const next = new Map<string, SettingsNavInstallStatus>([
      [
        'orchestration',
        getAgentSkillNavInstallStatus({
          name: ORCHESTRATION_SKILL_NAME,
          installed: orchestrationSkill.installed,
          loading: orchestrationSkill.loading,
          inventory: applicableFreshnessInventory
        })
      ]
    ])
    if (linearConnected) {
      next.set(
        'linear',
        getLinearAgentSkillNavInstallStatus({
          skills: linearSkill.skills,
          installed: linearSkill.installed,
          loading: linearSkill.loading,
          inventory: applicableFreshnessInventory
        })
      )
    }
    if (showDesktopOnlySettings) {
      next.set(
        'computer-use',
        getAgentSkillNavInstallStatus({
          name: COMPUTER_USE_SKILL_NAME,
          installed: computerUseSkill.installed,
          loading: computerUseSkill.loading,
          inventory: applicableFreshnessInventory
        })
      )
      if (settings) {
        next.set(
          'voice',
          voiceModelStatesLoading
            ? 'checking'
            : hasReadyVoiceModel(settings, modelStates)
              ? 'installed'
              : 'install'
        )
      }
    }
    return next
  }, [
    computerUseSkill.installed,
    computerUseSkill.loading,
    linearConnected,
    linearSkill.installed,
    linearSkill.loading,
    linearSkill.skills,
    modelStates,
    orchestrationSkill.installed,
    orchestrationSkill.loading,
    settings,
    showDesktopOnlySettings,
    skillFreshnessApplies,
    skillFreshnessInventory,
    voiceModelStatesLoading
  ])

  const baseNavSections = useSettingsNavigationMetadata()
  const navSections = useMemo(
    () =>
      baseNavSections.map((section) => {
        const installStatus = capabilityInstallStatusBySectionId.get(section.id)
        return installStatus ? { ...section, installStatus } : section
      }),
    [baseNavSections, capabilityInstallStatusBySectionId]
  )
  const navSectionById = useMemo(
    () => new Map(navSections.map((section) => [section.id, section] as const)),
    [navSections]
  )

  const visibleNavSections = useMemo(() => {
    const rankedSections = rankSettingsSearchItems(
      settingsSearchQuery,
      navSections,
      getSettingsSectionSearchEntries
    ).map(({ item }) => item)
    if (
      !hasUnsavedSourceControlAiPromptChanges ||
      rankedSections.some((section) => section.id === 'git')
    ) {
      return rankedSections
    }
    const gitSection = navSectionById.get('git')
    return gitSection ? [...rankedSections, gitSection] : rankedSections
  }, [hasUnsavedSourceControlAiPromptChanges, navSectionById, navSections, settingsSearchQuery])
  const visibleSectionIds = useMemo(
    () => new Set(visibleNavSections.map((section) => section.id)),
    [visibleNavSections]
  )
  const neededSectionIds = useMemo(
    () =>
      deriveNeededSectionIds({
        navSectionIds: navSections.map((section) => section.id),
        mountedSectionIds,
        activeSectionId,
        pendingSectionId: pendingNavSectionRef.current,
        query: settingsSearchQuery,
        visibleSectionIds
      }),
    [
      activeSectionId,
      mountedSectionIds,
      navSections,
      pendingNavSectionRef,
      settingsSearchQuery,
      visibleSectionIds
    ]
  )

  if ([...neededSectionIds].some((id) => !mountedSectionIds.has(id))) {
    // Why: record newly needed sections during render so panes don't wait for a follow-up Effect.
    setMountedSectionIds(neededSectionIds)
  }

  const getSectionSearchEntries = (sectionId: string): SettingsSearchEntry[] => {
    const section = navSectionById.get(sectionId)
    return section ? getSettingsSectionSearchEntries(section) : []
  }
  const isSectionMounted = (sectionId: string): boolean => neededSectionIds.has(sectionId)

  const generalNavSections = visibleNavSections.filter((section) => !section.id.startsWith('repo-'))
  const generalNavGroupDefinitions = getSettingsNavGroupDefinitionsForSearch(
    visibleNavSections,
    settingsSearchQuery
  )
  const generalNavGroups: SettingsNavGroup[] = generalNavGroupDefinitions
    .map((group) => ({
      id: group.id,
      title: translate(group.titleKey, group.titleDefault),
      sections: generalNavSections.filter((section) => section.group === group.id)
    }))
    .filter((group) => group.sections.length > 0 || group.id === 'setup')
  const repoNavSections = visibleNavSections
    .filter((section) => section.id.startsWith('repo-'))
    .map((section) => {
      const repo = repos.find((entry) => entry.id === section.id.replace('repo-', ''))
      return {
        ...section,
        badgeColor: repo?.badgeColor,
        isRemote: !!repo?.connectionId,
        repoIcon: repo?.repoIcon,
        upstream: repo?.upstream
      }
    })

  return {
    linearConnected,
    showDesktopOnlySettings,
    visibleNavSections,
    visibleSectionIds,
    neededSectionIds,
    getSectionSearchEntries,
    isSectionMounted,
    generalNavGroups,
    repoNavSections
  }
}
