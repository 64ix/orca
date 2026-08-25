import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { resolveTaskDetailPanelSelection } from './task-detail-panel-selection'

/**
 * Board-attached panel selection lifecycle (#52): reads the ephemeral selection from the
 * store and clears it once the selected card is no longer rendered on the board. The
 * returned `selectedCardId` runs the same resolver, so the panel never renders a ghost
 * even before the effect clears the store.
 */
export function useTaskDetailPanelSelection(visibleCardIds: ReadonlySet<string>): {
  selectedCardId: string | null
  openCardDetail: (cardId: string) => void
  closeCardDetail: () => void
} {
  const selectedCardId = useAppStore((s) => s.boardCardDetailId)
  const openCardDetail = useAppStore((s) => s.openBoardCardDetail)
  const closeCardDetail = useAppStore((s) => s.closeBoardCardDetail)

  useEffect(() => {
    if (selectedCardId !== null && !visibleCardIds.has(selectedCardId)) {
      closeCardDetail()
    }
  }, [selectedCardId, visibleCardIds, closeCardDetail])

  return {
    selectedCardId: resolveTaskDetailPanelSelection(selectedCardId, visibleCardIds),
    openCardDetail,
    closeCardDetail
  }
}
