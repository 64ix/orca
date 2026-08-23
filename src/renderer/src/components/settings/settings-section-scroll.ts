import type { MutableRefObject } from 'react'

export function getSettingsScrollTarget(
  sectionId: string,
  container?: HTMLElement | null
): HTMLElement | null {
  return (
    container?.querySelector<HTMLElement>(`[data-settings-section="${CSS.escape(sectionId)}"]`) ??
    document.getElementById(sectionId)
  )
}

export function scrollSubsectionIntoView(targetId: string, container?: HTMLElement | null): void {
  // Why: the pane is swapped in wholesale, so a subsection deep link only nudges inner scroll when the pane exceeds the viewport.
  const target = getSettingsScrollTarget(targetId, container)
  if (!target) {
    return
  }
  if (!container) {
    target.scrollIntoView({ block: 'start' })
    return
  }
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = targetRect.top - containerRect.top + container.scrollTop
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  container.scrollTo({ top: Math.min(Math.max(0, targetTop - 16), maxScrollTop) })
}

export function cancelPendingSettingsSubsectionScrollFrame(
  frameRef: MutableRefObject<number | null>
): void {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }
}
