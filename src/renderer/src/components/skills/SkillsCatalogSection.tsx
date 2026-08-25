import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react'
import type { SkillBundleCatalog } from '../../../../shared/skill-catalog'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { useSkillFreshness } from '@/hooks/useSkillFreshness'
import { notifyInstalledAgentSkillsChanged } from '@/hooks/useInstalledAgentSkills'
import { INSTALLED_AGENT_SKILLS_CHANGED_EVENT } from '@/hooks/installed-agent-skills-change-event'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  buildSkillCatalogRows,
  filterSkillCatalogRows,
  type SkillCatalogRow
} from './skill-catalog'
import { SkillCatalogRow as SkillCatalogRowView } from './SkillCatalogRow'
import {
  acknowledgeCatalogSkillInstall,
  cancelCatalogSkillInstall,
  startCatalogSkillInstall,
  useSkillCatalogInstallRun
} from './skill-catalog-install-store'
import { startSkillUpdateRun, useSkillUpdateRun } from './skill-update-run-store'

const EMPTY_CATALOG: SkillBundleCatalog = { schemaVersion: 1, skills: [], scannedAt: 0 }

export function SkillsCatalogSection({
  discoveredSkills,
  installabilityKnown,
  query
}: {
  discoveredSkills: readonly DiscoveredSkill[]
  installabilityKnown: boolean
  query: string
}): React.JSX.Element | null {
  const freshness = useSkillFreshness(true)
  const installRun = useSkillCatalogInstallRun()
  const updateRun = useSkillUpdateRun()
  const [catalog, setCatalog] = useState<SkillBundleCatalog>(EMPTY_CATALOG)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const mountedRef = useMountedRef()

  const loadCatalog = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.skills.catalog()
      if (mountedRef.current) {
        setCatalog(next)
        setCatalogError(null)
      }
    } catch (cause) {
      console.error('Failed to load the skills catalog:', cause)
      if (mountedRef.current) {
        setCatalogError(
          translate(
            'auto.components.skills.SkillCatalogSection.loadFailed',
            'Could not load the Orca skills catalog.'
          )
        )
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void loadCatalog()
    // Why: descriptors are per-build constants, but refreshing on the installed
    // event keeps the section consistent with the page's own reload cadence.
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, loadCatalog)
    return () => window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, loadCatalog)
  }, [loadCatalog])

  const rows = useMemo(
    () =>
      filterSkillCatalogRows(
        buildSkillCatalogRows({
          descriptors: catalog.skills,
          discoveredSkills,
          freshness: freshness.inventory,
          installabilityKnown
        }),
        query
      ),
    [catalog.skills, discoveredSkills, freshness.inventory, installabilityKnown, query]
  )

  const installRunNames = useMemo(
    () => new Set(installRun.state === 'idle' ? [] : installRun.names),
    [installRun]
  )
  const updateRunNames = useMemo(
    () => new Set(updateRun.state === 'idle' ? [] : updateRun.names),
    [updateRun]
  )
  const installBusy = installRun.state === 'running'
  const updateBusy = updateRun.state === 'running'
  const isBusyFor = (row: SkillCatalogRow): boolean =>
    (installBusy && installRunNames.has(row.name)) || (updateBusy && updateRunNames.has(row.name))

  const runFailed = installRun.state === 'error'
  const runSucceeded = installRun.state === 'success'

  const handleInstall = (name: string): void => {
    setRemoveError(null)
    void startCatalogSkillInstall([name])
  }

  const handleUpdate = (name: string): void => {
    setRemoveError(null)
    void startSkillUpdateRun([name])
  }

  const handleUninstall = async (name: string): Promise<void> => {
    setRemoveError(null)
    try {
      const operation = await window.api.skills.removeInstall({
        name,
        destination: { scope: 'global' }
      })
      if (operation.status !== 'ok') {
        setRemoveError(
          translate(
            'auto.components.skills.SkillCatalogSection.removeFailed',
            'Could not remove {{value0}}.',
            { value0: name }
          )
        )
        return
      }
      if (operation.value.status === 'removed' || operation.value.status === 'unchanged') {
        notifyInstalledAgentSkillsChanged()
      } else {
        setRemoveError(
          translate(
            'auto.components.skills.SkillCatalogSection.removeConflict',
            '{{value0}} was not removed because it was changed on disk.',
            { value0: name }
          )
        )
      }
    } catch (cause) {
      console.error('Failed to remove catalog skill:', cause)
      setRemoveError(
        translate(
          'auto.components.skills.SkillCatalogSection.removeFailed',
          'Could not remove {{value0}}.',
          { value0: name }
        )
      )
    }
  }

  const retry = (): void => {
    if (installRun.state === 'error') {
      void startCatalogSkillInstall(installRun.failedNames)
    }
  }

  if (catalogError) {
    return (
      <section className="border-t border-border/50 px-2 py-2" data-skills-catalog>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-destructive" role="alert">
            {catalogError}
          </p>
          <Button type="button" variant="outline" size="xs" onClick={() => void loadCatalog()}>
            {translate('auto.components.skills.SkillsPage.retry', 'Retry')}
          </Button>
        </div>
      </section>
    )
  }

  if (catalog.skills.length === 0) {
    return null
  }

  // Why: a query that filters the whole section out leaves the page's own
  // "No matches" state to explain the empty search; an empty box under it would
  // only repeat the same fact with a header.
  if (rows.length === 0) {
    return null
  }

  return (
    <section className="border-t border-border/50" data-skills-catalog>
      <div className="flex items-baseline justify-between px-2 pt-3 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {translate(
            'auto.components.skills.SkillCatalogSection.title',
            'Orca skills ({{value0}})',
            { value0: catalog.skills.length }
          )}
        </h2>
        {freshness.loading ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {translate(
              'auto.components.skills.SkillCatalogSection.checking',
              'Checking installed versions…'
            )}
          </span>
        ) : freshness.error ? (
          <span className="text-[11px] text-muted-foreground">
            {translate(
              'auto.components.skills.SkillCatalogSection.checkFailed',
              'Could not check installed versions.'
            )}
          </span>
        ) : null}
      </div>

      {installBusy ? (
        <p
          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-3.5 animate-spin" />
          {installRun.names.length === 1
            ? translate(
                'auto.components.skills.SkillCatalogSection.installingOne',
                'Installing {{value0}}…',
                { value0: installRun.names[0] }
              )
            : translate(
                'auto.components.skills.SkillCatalogSection.installingMany',
                'Installing {{value0}} skills…',
                { value0: installRun.names.length }
              )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void cancelCatalogSkillInstall()}
          >
            {translate('auto.components.skills.SkillFreshnessUpdateDialog.stop', 'Stop')}
          </Button>
        </p>
      ) : null}

      {runSucceeded ? (
        <p className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          {installRun.names.length === 1
            ? translate(
                'auto.components.skills.SkillCatalogSection.installedOne',
                'Installed {{value0}}.',
                { value0: installRun.names[0] }
              )
            : translate(
                'auto.components.skills.SkillCatalogSection.installedMany',
                'Installed {{value0}} skills.',
                { value0: installRun.names.length }
              )}
        </p>
      ) : null}

      {runFailed ? (
        <div className="space-y-1.5 px-2 py-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex items-center gap-2 text-xs text-destructive" role="alert">
              <AlertTriangle className="size-3.5" />
              {installRun.message}
            </p>
            <span className="flex items-center gap-1.5">
              <Button type="button" variant="outline" size="xs" onClick={retry}>
                {translate('auto.components.skills.SkillFreshnessUpdateDialog.retry', 'Retry')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void acknowledgeCatalogSkillInstall()}
              >
                {translate('auto.components.skills.SkillCatalogSection.dismiss', 'Dismiss')}
              </Button>
            </span>
          </div>
          {installRun.output.trim() ? (
            <Collapsible className="min-w-0">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="group -ml-2 gap-1.5 text-muted-foreground"
                >
                  <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  {translate(
                    'auto.components.skills.SkillFreshnessUpdateDialog.showLog',
                    'Show log'
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 min-w-0">
                <pre className="scrollbar-sleek max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {installRun.output.trim()}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : null}

      {removeError ? (
        <p className="px-2 py-1 text-xs text-destructive" role="alert">
          {removeError}
        </p>
      ) : null}

      <div
        role="listbox"
        aria-label={translate(
          'auto.components.skills.SkillCatalogSection.listAria',
          'Orca skills catalog'
        )}
        aria-orientation="vertical"
      >
        <TooltipProvider>
          {rows.map((row) => (
            <SkillCatalogRowView
              key={row.name}
              row={row}
              busy={isBusyFor(row)}
              onInstall={() => handleInstall(row.name)}
              onUpdate={() => handleUpdate(row.name)}
              onUninstall={() => void handleUninstall(row.name)}
            />
          ))}
        </TooltipProvider>
      </div>
    </section>
  )
}
