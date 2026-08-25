import { Loader2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { FeatureBoardCard } from '../feature-board-card-model'
import { TaskDetailConversationRowItem } from './task-detail-conversation-row'
import {
  taskDetailConversationIconAgent,
  useTaskDetailConversations
} from './use-task-detail-conversations'

/** Conversations section (#54): one row per live agent pane or vault transcript of the card's worktree. */
export function TaskDetailConversationsSection({
  card
}: {
  card: FeatureBoardCard
}): React.JSX.Element {
  const { rows, loading, actions } = useTaskDetailConversations(card.worktree)

  return (
    <section className="flex min-w-0 flex-col gap-1" data-task-detail-conversations="">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {translate('components.featureBoard.panel.conversations', 'Conversations')}
        {loading ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
      </h3>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">
          {loading
            ? translate('components.featureBoard.panel.conversationsLoading', 'Loading…')
            : translate(
                'components.featureBoard.panel.noConversations',
                'No sessions for this worktree'
              )}
        </p>
      ) : (
        rows.map((row) => (
          <TaskDetailConversationRowItem
            key={row.key}
            row={row}
            iconAgent={taskDetailConversationIconAgent(row)}
            actions={actions}
          />
        ))
      )}
    </section>
  )
}
