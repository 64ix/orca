/**
 * Lane-key-agnostic hit-testing shared by every pointer-based kanban board (the classic
 * workspace-status drawer and the feature board, #47): which lane a pointer point falls
 * inside, with a gap-tolerance fallback to the nearest lane.
 */
export type LaneDropTargetRect<TLane extends string> = {
  lane: TLane
  left: number
  top: number
  right: number
  bottom: number
}

const DEFAULT_LANE_DROP_GAP_TOLERANCE_PX = 24

export function resolveLaneDropTargetFromRects<TLane extends string>(
  rects: readonly LaneDropTargetRect<TLane>[],
  x: number,
  y: number,
  gapTolerance = DEFAULT_LANE_DROP_GAP_TOLERANCE_PX
): TLane | null {
  let nearest: { lane: TLane; distance: number } | null = null

  for (const rect of rects) {
    if (y < rect.top || y > rect.bottom) {
      continue
    }
    if (x >= rect.left && x <= rect.right) {
      return rect.lane
    }
    const distance = x < rect.left ? rect.left - x : x - rect.right
    if (distance > gapTolerance) {
      continue
    }
    if (!nearest || distance < nearest.distance) {
      nearest = { lane: rect.lane, distance }
    }
  }

  return nearest?.lane ?? null
}
