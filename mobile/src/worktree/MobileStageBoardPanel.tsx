import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { loadHosts } from '../transport/host-store'
import { useHostClient } from '../transport/client-context'
import { sendSingleFlightRequest } from '../transport/request-single-flight'
import { getCachedWorktrees, setCachedWorktrees } from '../cache/worktree-cache'
import { BottomDrawer } from '../components/BottomDrawer'
import { ActionSheetContent, type ActionSheetAction } from '../components/ActionSheetModal'
import { colors } from '../theme/mobile-theme'
import type { Worktree } from './workspace-list-types'
import { buildMobileStageBoardCards, type MobileStageBoardCard } from './mobile-stage-board-card'
import {
  buildMobileStageBoardColumns,
  type MobileStageBoardColumn
} from './mobile-stage-board-columns'
import {
  buildMobileStageActionOptions,
  runMobileStageAction,
  type MobileStageActionOption
} from './mobile-stage-action-sheet-model'
import { declareMobileWorktreeStage } from './mobile-stage-declaration'
import { MOBILE_STAGE_LABELS } from './mobile-stage-labels'
import { WORKTREE_PS_FULL_LIMIT } from './worktree-catalog-snapshot-client'
import { MobileStageBoardCardRow } from './MobileStageBoardCardRow'
import { boardStyles } from './mobile-stage-board-styles'

const REFRESH_MS = 5000

type Props = { hostId: string | undefined }

/**
 * Ticket #98: one stage per full-width page, swiped horizontally with snap paging (D5) — a
 * horizontally scrollable stage chip strip above jumps to and reflects the current page. All
 * seven WORKFLOW_STAGE_IDS stages are always present, in fixed order; no drag & drop.
 */
export function MobileStageBoardPanel({ hostId }: Props) {
  const router = useRouter()
  const { width: windowWidth } = useWindowDimensions()
  const { client, state: connState } = useHostClient(hostId)
  const pagesRef = useRef<FlatList<MobileStageBoardColumn<MobileStageBoardCard>>>(null)

  const [hostName, setHostName] = useState('')
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [actionTarget, setActionTarget] = useState<Worktree | null>(null)

  useEffect(() => {
    if (!hostId) {
      return
    }
    const cached = getCachedWorktrees(hostId) as Worktree[] | null
    if (cached) {
      setWorktrees(cached)
    }
    let stale = false
    void loadHosts().then((hosts) => {
      if (!stale) {
        setHostName(hosts.find((h) => h.id === hostId)?.name ?? '')
      }
    })
    return () => {
      stale = true
    }
  }, [hostId])

  const fetchWorktrees = useCallback(async () => {
    if (!client || !hostId) {
      return
    }
    const response = await sendSingleFlightRequest(client, hostId, 'worktree.ps', {
      limit: WORKTREE_PS_FULL_LIMIT
    })
    if (!response.ok) {
      setCatalogError(response.error.message)
      return
    }
    const result = response.result as { worktrees?: Worktree[] }
    const list = result.worktrees ?? []
    setCachedWorktrees(hostId, list, { proven: true })
    setWorktrees(list)
    setCatalogError(null)
  }, [client, hostId])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const poll = () => {
        if (!cancelled) {
          void fetchWorktrees()
        }
      }
      poll()
      const interval = setInterval(poll, REFRESH_MS)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }, [fetchWorktrees])
  )

  const cards = useMemo(() => buildMobileStageBoardCards(worktrees), [worktrees])
  const columns = useMemo(() => buildMobileStageBoardColumns(cards), [cards])

  const scrollToStageIndex = useCallback(
    (index: number) => {
      pagesRef.current?.scrollToOffset({ offset: index * windowWidth, animated: true })
      setActiveIndex(index)
    },
    [windowWidth]
  )

  const onPagesMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / windowWidth))
    },
    [windowWidth]
  )

  const onCardPress = useCallback(
    (card: MobileStageBoardCard) => {
      if (client && connState === 'connected') {
        void client
          .sendRequest('worktree.activate', {
            worktree: `id:${card.worktreeId}`,
            notifyClients: false,
            navigation: 'caller'
          })
          .catch(() => null)
      }
      router.push(
        `/h/${hostId}/session/${encodeURIComponent(card.worktreeId)}?name=${encodeURIComponent(card.name)}`
      )
    },
    [client, connState, hostId, router]
  )

  const onCardLongPress = useCallback(
    (card: MobileStageBoardCard) => {
      const worktree = worktrees.find((w) => w.worktreeId === card.worktreeId)
      if (worktree) {
        setActionTarget(worktree)
      }
    },
    [worktrees]
  )

  const handleSelectStageOption = useCallback(
    async (option: MobileStageActionOption) => {
      const targetWorktree = actionTarget
      setActionTarget(null)
      if (!client || !targetWorktree) {
        return
      }
      const outcome = await runMobileStageAction(option, (stage) =>
        declareMobileWorktreeStage(client, targetWorktree.worktreeId, stage)
      )
      if (outcome.kind === 'declared') {
        setWorktrees((prev) =>
          prev.map((w) =>
            w.worktreeId === targetWorktree.worktreeId
              ? { ...w, workflowStage: option.requestedStage }
              : w
          )
        )
        void fetchWorktrees()
        return
      }
      Alert.alert(
        outcome.kind === 'refused' ? 'Shipped is set automatically' : 'Could not update stage',
        outcome.message
      )
    },
    [actionTarget, client, fetchWorktrees]
  )

  const sheetActions: ActionSheetAction[] = useMemo(() => {
    if (!actionTarget) {
      return []
    }
    return buildMobileStageActionOptions(actionTarget.workflowStage ?? null).map((option) => ({
      label: option.isCurrent ? `${option.label} · Current` : option.label,
      hint: option.refusalMessage ?? undefined,
      onPress: () => void handleSelectStageOption(option)
    }))
  }, [actionTarget, handleSelectStageOption])

  const showPlaceholder = worktrees.length === 0 && connState !== 'connected'
  const showError = worktrees.length === 0 && !!catalogError && !showPlaceholder

  return (
    <SafeAreaView style={boardStyles.container} edges={['top']}>
      <View style={boardStyles.topRow}>
        <Pressable style={boardStyles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={boardStyles.titleWrap}>
          <Text style={boardStyles.heading}>Board</Text>
          {hostName ? (
            <Text style={boardStyles.subheading} numberOfLines={1}>
              {hostName}
            </Text>
          ) : null}
        </View>
      </View>

      {showPlaceholder ? (
        <View style={boardStyles.placeholder}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={boardStyles.placeholderText}>Connecting to {hostName || 'host'}…</Text>
        </View>
      ) : showError ? (
        <View style={boardStyles.placeholder}>
          <Text style={boardStyles.placeholderText}>{catalogError}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={boardStyles.chipStrip}
          >
            {columns.map((column, index) => {
              const active = index === activeIndex
              return (
                <Pressable
                  key={column.stage}
                  style={[boardStyles.chip, active && boardStyles.chipActive]}
                  onPress={() => scrollToStageIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${MOBILE_STAGE_LABELS[column.stage]}, ${column.cards.length}`}
                >
                  <Text style={[boardStyles.chipLabel, active && boardStyles.chipLabelActive]}>
                    {MOBILE_STAGE_LABELS[column.stage]}
                  </Text>
                  <Text style={boardStyles.chipCount}>{column.cards.length}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <FlatList
            ref={pagesRef}
            data={columns}
            keyExtractor={(column) => column.stage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPagesMomentumEnd}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index
            })}
            renderItem={({ item: column }) => (
              <View style={[boardStyles.page, { width: windowWidth }]}>
                <FlatList
                  data={column.cards}
                  keyExtractor={(card) => card.id}
                  contentContainerStyle={boardStyles.pageContent}
                  ListEmptyComponent={
                    <View style={boardStyles.emptyState}>
                      <Text style={boardStyles.emptyStateText}>
                        No workspaces in {MOBILE_STAGE_LABELS[column.stage]}
                      </Text>
                    </View>
                  }
                  renderItem={({ item: card }) => (
                    <MobileStageBoardCardRow
                      card={card}
                      onPress={onCardPress}
                      onLongPress={onCardLongPress}
                    />
                  )}
                />
              </View>
            )}
          />
        </>
      )}

      <BottomDrawer visible={actionTarget != null} onClose={() => setActionTarget(null)}>
        {actionTarget ? (
          <ActionSheetContent
            title={actionTarget.displayName || actionTarget.repo}
            message="Set delivery stage"
            actions={sheetActions}
            onClose={() => setActionTarget(null)}
          />
        ) : null}
      </BottomDrawer>
    </SafeAreaView>
  )
}
