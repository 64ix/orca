import { Ghost } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import type { MobileGhostBoardCard } from './mobile-ghost-board-cards'
import { MOBILE_GHOST_BADGE_LABELS } from './mobile-ghost-labels'
import { boardStyles } from './mobile-stage-board-styles'

type Props = {
  card: MobileGhostBoardCard
  onPress: (card: MobileGhostBoardCard) => void
}

/**
 * A ghost card (#100) — visually distinct from a workspace card via a dashed border, muted
 * opacity, and a Ghost icon, mirroring desktop's FeatureBoardGhostCard. Adopt and dismiss live
 * in the detail sheet the tap opens, not on the row itself.
 */
export function MobileGhostCardRow({ card, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [boardStyles.ghostCard, pressed && boardStyles.ghostCardPressed]}
      onPress={() => onPress(card)}
    >
      <View style={boardStyles.ghostTitleRow}>
        <Ghost size={14} color={colors.textMuted} />
        <Text style={boardStyles.ghostNumber}>#{card.issue.number}</Text>
        <Text style={boardStyles.ghostTitle} numberOfLines={1}>
          {card.issue.title}
        </Text>
      </View>
      {card.badges.length > 0 ? (
        <View style={boardStyles.ghostBadgeRow}>
          {card.badges.map((badge) => (
            <View key={badge} style={boardStyles.ghostBadge}>
              <Text style={boardStyles.ghostBadgeText}>{MOBILE_GHOST_BADGE_LABELS[badge]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}
