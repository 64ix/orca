export type MobileGhostDetailBodyState =
  | { kind: 'loading' }
  | { kind: 'loaded'; body: string }
  | { kind: 'unavailable' }

export type MobileGhostDetailContent = { title: string; message: string }

type GhostDetailIssue = { number: number; title: string; state: string }

/**
 * Builds the tap-to-view sheet's title/message strings (#100) — plain English (D8), rendered
 * through the existing `ActionSheetContent` primitive rather than a new one. `state` renders
 * verbatim (ghosts are always open issues, but this never assumes it).
 */
export function buildMobileGhostDetailContent(
  issue: GhostDetailIssue,
  bodyState: MobileGhostDetailBodyState
): MobileGhostDetailContent {
  const stateLine = `#${issue.number} · ${issue.state}`
  const bodyLine =
    bodyState.kind === 'loading'
      ? 'Loading description…'
      : bodyState.kind === 'unavailable'
        ? 'Description unavailable.'
        : bodyState.body.trim() || 'No description.'
  return { title: issue.title, message: `${stateLine}\n\n${bodyLine}` }
}
