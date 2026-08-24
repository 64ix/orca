import { describe, expect, it } from 'vitest'
import { resolveLaneDropTargetFromRects } from './kanban-lane-drop-target-rects'

const rects = [
  { lane: 'todo', left: 0, top: 0, right: 200, bottom: 600 },
  { lane: 'doing', left: 212, top: 0, right: 412, bottom: 600 },
  { lane: 'done', left: 424, top: 0, right: 624, bottom: 600 }
]

describe('resolveLaneDropTargetFromRects', () => {
  it('uses the containing lane when the pointer is inside one', () => {
    expect(resolveLaneDropTargetFromRects(rects, 240, 100)).toBe('doing')
  })

  it('falls back to the nearest lane within tolerance when the pointer is in a gap', () => {
    expect(resolveLaneDropTargetFromRects(rects, 206, 100)).toBe('todo')
    expect(resolveLaneDropTargetFromRects(rects, 418, 100)).toBe('doing')
  })

  it('returns null outside every lane row and beyond gap tolerance', () => {
    expect(resolveLaneDropTargetFromRects(rects, 206, 620)).toBeNull()
    expect(resolveLaneDropTargetFromRects(rects, -100, 100)).toBeNull()
  })

  it('honors a custom gap tolerance', () => {
    expect(resolveLaneDropTargetFromRects(rects, 206, 100, 3)).toBeNull()
    expect(resolveLaneDropTargetFromRects(rects, 204, 100, 5)).toBe('todo')
  })

  it('works with any string literal lane type, not just WorkspaceStatus', () => {
    const stageRects = [
      { lane: 'idea' as const, left: 0, top: 0, right: 100, bottom: 100 },
      { lane: 'spec' as const, left: 100, top: 0, right: 200, bottom: 100 }
    ]
    expect(resolveLaneDropTargetFromRects(stageRects, 50, 50)).toBe('idea')
  })
})
