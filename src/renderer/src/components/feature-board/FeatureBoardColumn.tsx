import React from 'react'
import { translate } from '@/i18n/i18n'
import type { WorkflowStage } from '../../../../shared/workflow-stages'
import { FeatureBoardCard } from './FeatureBoardCard'
import { FeatureBoardColumnHeader } from './FeatureBoardColumnHeader'
import type { FeatureBoardCard as FeatureBoardCardModel } from './feature-board-card-model'

export type FeatureBoardColumnProps = {
  stage: WorkflowStage
  cards: readonly FeatureBoardCardModel[]
  /** Extension point for #48 — forwarded to `FeatureBoardColumnHeader`. */
  headerAction?: React.ReactNode
  /**
   * Extension point for #47 (drag & drop stage declaration): a drop handler for a card dropped
   * onto this column, with the index among `cards` it was dropped at. Unset in #44 — the board
   * is read-only until the pointer-drag machinery (reused from the classic kanban drawer) lands.
   */
  onDropCard?: (worktreeId: string, dropIndex: number) => void
}

export function FeatureBoardColumn({
  stage,
  cards,
  headerAction
}: FeatureBoardColumnProps): React.JSX.Element {
  return (
    <div
      className="flex h-full w-[280px] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/20"
      data-feature-board-column={stage}
    >
      <FeatureBoardColumnHeader stage={stage} count={cards.length} headerAction={headerAction} />
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.length === 0 ? (
          <div className="px-1 py-6 text-center text-[12px] text-muted-foreground/70">
            {translate('components.featureBoard.column.empty', 'No cards')}
          </div>
        ) : (
          cards.map((card) => <FeatureBoardCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  )
}
