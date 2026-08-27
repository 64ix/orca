import type { GhostCandidateBadge } from '../../../src/shared/feature-board/ghost-candidates'

/**
 * Mobile has no i18n (Wave 5, deferred — see config/localization-audit.md) so this is a plain
 * English label map, matching desktop's FeatureBoardGhostCard fallback wording exactly
 * (BADGE_LABEL_FALLBACKS) — keyed as a `Record<GhostCandidateBadge, string>` so a new badge
 * added there fails typecheck here instead of silently rendering blank.
 */
export const MOBILE_GHOST_BADGE_LABELS: Record<GhostCandidateBadge, string> = {
  'ready-for-agent': 'Ready for agent',
  'ready-for-human': 'Ready for human',
  'needs-triage': 'Needs triage'
}
