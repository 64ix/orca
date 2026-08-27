import { useCallback, useMemo, useState } from 'react'
import { Alert, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ActionSheetContent } from '../components/ActionSheetModal'
import { BottomDrawer } from '../components/BottomDrawer'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { declareMobileWorktreeStage } from '../worktree/mobile-stage-declaration'
import {
  runMobileStageAction,
  type MobileStageActionOption
} from '../worktree/mobile-stage-action-sheet-model'
import { deriveMobileWorktreeStage } from '../worktree/mobile-stage-facts'
import { buildMobilePrRowModel } from '../worktree/mobile-pr-row-model'
import { buildMobileStageRowModel } from '../worktree/mobile-stage-row-model'
import { MobileSessionPrRow } from './MobileSessionPrRow'
import { MobileSessionStageRow } from './MobileSessionStageRow'
import { buildMobileSessionPrRowTarget } from './mobile-session-pr-row-route'
import {
  buildMobileSessionStageSheetActions,
  mobileSessionStageOutcomeAlert
} from './mobile-session-stage-sheet'
import { workspaceRowStyles } from './mobile-session-workspace-rows-styles'
import { useMobileSessionWorkspaceRow } from './use-mobile-session-workspace-row'

type Props = {
  hostId: string | undefined
  worktreeId: string
  client: RpcClient | null
  connState: ConnectionState
  worktreeName: string
}

/**
 * The session screen's workspace rows (#99): a stage row (effective stage, and why it
 * may differ from the declaration — tap opens the same stage action sheet as the board,
 * #98's models) and a PR row (linked PR number/state — tap opens the existing PR
 * surface). Renders nothing when the catalog has no row for this worktree yet, or for a
 * synthetic (folder:/floating) route — no guessed stage, no fake "no PR" claim (D6).
 */
export function MobileSessionWorkspaceRows({
  hostId,
  worktreeId,
  client,
  connState,
  worktreeName
}: Props) {
  const router = useRouter()
  const { worktree, setWorktree, refresh } = useMobileSessionWorkspaceRow({
    client,
    connState,
    hostId,
    worktreeId
  })
  const [sheetVisible, setSheetVisible] = useState(false)

  const stageModel = useMemo(
    () => (worktree ? buildMobileStageRowModel(deriveMobileWorktreeStage(worktree)) : null),
    [worktree]
  )
  const prModel = useMemo(
    () => (worktree ? buildMobilePrRowModel(worktree.linkedPR) : null),
    [worktree]
  )

  const handleSelectStageOption = useCallback(
    async (option: MobileStageActionOption) => {
      setSheetVisible(false)
      if (!client || !worktree) {
        return
      }
      const outcome = await runMobileStageAction(option, (stage) =>
        declareMobileWorktreeStage(client, worktree.worktreeId, stage)
      )
      if (outcome.kind === 'declared') {
        setWorktree({ ...worktree, workflowStage: option.requestedStage })
        void refresh()
        return
      }
      const alertCopy = mobileSessionStageOutcomeAlert(outcome)
      if (alertCopy) {
        Alert.alert(alertCopy.title, alertCopy.message)
      }
    },
    [client, refresh, setWorktree, worktree]
  )

  const sheetActions = useMemo(
    () =>
      worktree
        ? buildMobileSessionStageSheetActions(
            worktree.workflowStage ?? null,
            (option) => void handleSelectStageOption(option)
          )
        : [],
    [worktree, handleSelectStageOption]
  )

  if (!worktree || !stageModel) {
    return null
  }

  return (
    <View style={workspaceRowStyles.container}>
      <MobileSessionStageRow model={stageModel} onPress={() => setSheetVisible(true)} />
      {prModel ? (
        <MobileSessionPrRow
          model={prModel}
          onPress={() => {
            const target = buildMobileSessionPrRowTarget(hostId ?? '', worktreeId, worktreeName)
            router.push(target)
          }}
        />
      ) : null}

      <BottomDrawer visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <ActionSheetContent
          title={worktree.displayName || worktree.repo}
          message="Set delivery stage"
          actions={sheetActions}
          onClose={() => setSheetVisible(false)}
        />
      </BottomDrawer>
    </View>
  )
}
