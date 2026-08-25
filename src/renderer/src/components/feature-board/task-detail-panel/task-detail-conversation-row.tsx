import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Focus, MoreHorizontal, Pencil, Play, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentIcon } from '@/lib/agent-catalog'
import type { agentTypeToIconAgent } from '@/lib/agent-status'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import type { TaskDetailConversationRow } from './task-detail-conversation-rows'

export type TaskDetailConversationRowActions = {
  onFocus: (row: Extract<TaskDetailConversationRow, { kind: 'live' }>) => void
  onResume: (row: Extract<TaskDetailConversationRow, { kind: 'vault' }>) => void
  onRename: (row: TaskDetailConversationRow, title: string) => void
  onDismiss: (row: Extract<TaskDetailConversationRow, { kind: 'live' }>) => void
  onDelete: (row: Extract<TaskDetailConversationRow, { kind: 'vault' }>) => void
}

function EditableTitle({
  title,
  label,
  editing,
  onStartEditing,
  onStopEditing,
  onCommit
}: {
  title: string
  label: string
  editing: boolean
  onStartEditing: () => void
  onStopEditing: () => void
  onCommit: (title: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(title)
      inputRef.current?.select()
    }
    // Why: seed the draft only on entry, not on every title/onStopEditing identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const commit = (): void => {
    onStopEditing()
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) {
      onCommit(trimmed)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
          if (event.key === 'Escape') {
            onStopEditing()
          }
        }}
        aria-label={label}
        className="h-5 w-full min-w-0 rounded-sm border border-border bg-background px-1 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="block min-w-0 flex-1 truncate text-left text-[11px] leading-snug text-foreground/90 hover:text-foreground"
          onClick={onStartEditing}
        >
          {title}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-72 break-all">
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

export function TaskDetailConversationRowItem({
  row,
  iconAgent,
  actions
}: {
  row: TaskDetailConversationRow
  /** Provider identity for the leading glyph. */
  iconAgent: ReturnType<typeof agentTypeToIconAgent>
  actions: TaskDetailConversationRowActions
}): React.JSX.Element {
  const renameLabel = translate('components.featureBoard.panel.conversationRename', 'Rename')
  const menuLabel = translate(
    'components.featureBoard.panel.conversationActions',
    'Conversation actions'
  )
  const isVault = row.kind === 'vault'
  const [editingTitle, setEditingTitle] = useState(false)

  return (
    <div
      data-conversation-row={row.key}
      className="group/conversation-row flex min-w-0 items-center gap-1.5 rounded-sm py-0.5 pr-0.5 worktree-agent-row-hover"
    >
      {/* Vault transcripts have no live state — the dot is only truthful for live rows. */}
      {!isVault ? <AgentStateDot state={row.state ?? 'done'} size="sm" /> : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <AgentIcon agent={iconAgent} size={14} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="max-w-72 break-all">
          {row.title}
        </TooltipContent>
      </Tooltip>
      <EditableTitle
        title={row.title}
        label={renameLabel}
        editing={editingTitle}
        onStartEditing={() => setEditingTitle(true)}
        onStopEditing={() => setEditingTitle(false)}
        onCommit={(title) => actions.onRename(row, title)}
      />
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/conversation-row:opacity-100 group-focus-within/conversation-row:opacity-100">
        {!isVault ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 rounded-full"
                onClick={() => actions.onFocus(row)}
                aria-label={translate(
                  'components.featureBoard.panel.conversationFocus',
                  'Focus session'
                )}
              >
                <Focus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('components.featureBoard.panel.conversationFocus', 'Focus session')}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 rounded-full"
              aria-label={menuLabel}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onSelect={() => setEditingTitle(true)}>
              <Pencil className="size-4" />
              {renameLabel}
            </DropdownMenuItem>
            {isVault ? (
              <>
                <DropdownMenuItem disabled={!row.resumable} onSelect={() => actions.onResume(row)}>
                  <Play className="size-4" />
                  {translate(
                    'components.featureBoard.panel.conversationResume',
                    'Resume in worktree'
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(row)}>
                  <Trash2 className="size-4" />
                  {translate('components.featureBoard.panel.conversationDelete', 'Delete')}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem variant="destructive" onSelect={() => actions.onDismiss(row)}>
                <X className="size-4" />
                {translate('components.featureBoard.panel.conversationDismiss', 'Dismiss')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
