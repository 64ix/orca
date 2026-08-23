import { useEffect, useRef, useState } from 'react'
import type { OrcaHooks } from '../../../../shared/orca-yaml-hook-types'
import type { Repo } from '../../../../shared/repo-types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { checkRuntimeHooks } from '@/runtime/runtime-hooks-client'
import { getRepoHostIdentity } from '../../store/slices/repo-host-identity'

export type RepoHooksInspectionState = {
  hasHooks: boolean
  hooks: OrcaHooks | null
  mayNeedUpdate: boolean
}

/**
 * Loads YAML-hook inspection results for the visible projects' host repos, keyed by host identity.
 */
export function useRepoHooksInspection(
  repos: readonly Repo[],
  neededRepos: readonly Repo[]
): Record<string, RepoHooksInspectionState> {
  const [repoHooksMap, setRepoHooksMap] = useState<Record<string, RepoHooksInspectionState>>({})
  const repoHooksRequestSeqRef = useRef(0)

  useEffect(() => {
    const repoHostIdentitySet = new Set(repos.map(getRepoHostIdentity))
    setRepoHooksMap((previous) => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([identity]) => repoHostIdentitySet.has(identity))
      ) as Record<string, RepoHooksInspectionState>
      return Object.keys(next).length === Object.keys(previous).length ? previous : next
    })
  }, [repos])

  useEffect(() => {
    if (neededRepos.length === 0) {
      return
    }

    let stale = false
    const requestSeq = ++repoHooksRequestSeqRef.current
    const liveRepoHostIdentities = new Set(repos.map(getRepoHostIdentity))

    void Promise.all(
      neededRepos.map(async (repo) => {
        const repoHostIdentity = getRepoHostIdentity(repo)
        if (isFolderRepo(repo)) {
          setRepoHooksMap((previous) => {
            if (previous[repoHostIdentity]) {
              return previous
            }
            return {
              ...previous,
              [repoHostIdentity]: { hasHooks: false, hooks: null, mayNeedUpdate: false }
            }
          })
          return
        }
        try {
          const hostId = getRepoExecutionHostId(repo)
          const parsedHost = parseExecutionHostId(hostId)
          const result = await checkRuntimeHooks(
            {
              activeRuntimeEnvironmentId:
                parsedHost?.kind === 'runtime' ? parsedHost.environmentId : null
            },
            repo.id,
            hostId
          )
          if (stale || requestSeq !== repoHooksRequestSeqRef.current) {
            return
          }
          setRepoHooksMap((previous) => {
            if (!liveRepoHostIdentities.has(repoHostIdentity)) {
              return previous
            }
            return { ...previous, [repoHostIdentity]: result }
          })
        } catch {
          // Keep last known value on transient failures.
          if (stale || requestSeq !== repoHooksRequestSeqRef.current) {
            return
          }
          setRepoHooksMap((previous) => {
            if (!liveRepoHostIdentities.has(repoHostIdentity)) {
              return previous
            }
            if (previous[repoHostIdentity]) {
              return previous
            }
            return {
              ...previous,
              [repoHostIdentity]: { hasHooks: false, hooks: null, mayNeedUpdate: false }
            }
          })
        }
      })
    )

    return () => {
      stale = true
    }
  }, [neededRepos, repos])

  return repoHooksMap
}
