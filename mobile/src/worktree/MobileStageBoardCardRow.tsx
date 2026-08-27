import { GitPullRequest } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { statusColor } from '../components/pr-sidebar/pr-sidebar-status-color'
import { prStateToken } from '../components/pr-state-token'
import { triggerMediumImpact } from '../platform/haptics'
import type { MobileStageBoardCard } from './mobile-stage-board-card'
import { boardStyles } from './mobile-stage-board-styles'

type Props = {
  card: MobileStageBoardCard
  onPress: (card: MobileStageBoardCard) => void
  onLongPress: (card: MobileStageBoardCard) => void
}

/** One board card (#98) — the desktop card's essentials at phone scale: name, repo, branch, PR state. */
export function MobileStageBoardCardRow({ card, onPress, onLongPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [boardStyles.card, pressed && boardStyles.cardPressed]}
      onPress={() => onPress(card)}
      onLongPress={() => {
        triggerMediumImpact()
        onLongPress(card)
      }}
      delayLongPress={400}
    >
      <View style={boardStyles.cardNameRow}>
        <Text style={boardStyles.cardName} numberOfLines={1}>
          {card.name}
        </Text>
        {card.prNumber != null && (
          <View style={boardStyles.prBadge}>
            <GitPullRequest
              size={10}
              color={card.prState ? statusColor(prStateToken(card.prState)) : undefined}
            />
            <Text
              style={[
                boardStyles.prNumber,
                { color: card.prState ? statusColor(prStateToken(card.prState)) : undefined }
              ]}
            >
              #{card.prNumber}
            </Text>
          </View>
        )}
        {card.isFolderWorkspace && (
          <View style={boardStyles.folderBadge}>
            <Text style={boardStyles.folderBadgeText}>Folder</Text>
          </View>
        )}
      </View>
      <View style={boardStyles.cardMetaRow}>
        <Text style={boardStyles.cardRepo} numberOfLines={1}>
          {card.repo}
        </Text>
        {card.branch ? (
          <Text style={boardStyles.cardBranch} numberOfLines={1}>
            {card.branch}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
