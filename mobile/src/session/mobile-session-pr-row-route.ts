import { panelRouteDescriptor } from './session-panel-host'

export type MobileSessionPrRowTarget = {
  pathname: string
  params: Record<string, string>
}

/**
 * The session PR row's tap target (#99): the existing PR surface, a segment of the
 * source-control hub (panelRouteDescriptor('pr')) — never a new screen. Mirrors the
 * `origin: 'session'` param the header's own PR/source-control taps already send
 * (handlePanelTap), so post-diff-open dismissal (U2) behaves the same from here.
 */
export function buildMobileSessionPrRowTarget(
  hostId: string,
  worktreeId: string,
  worktreeName: string
): MobileSessionPrRowTarget {
  const descriptor = panelRouteDescriptor('pr')
  return {
    pathname: descriptor.pathname,
    params: {
      hostId,
      worktreeId,
      name: worktreeName,
      origin: 'session',
      ...descriptor.params
    }
  }
}
