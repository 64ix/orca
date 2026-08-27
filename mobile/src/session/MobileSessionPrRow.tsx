import { ChevronRight, GitPullRequest } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { statusColor } from '../components/pr-sidebar/pr-sidebar-status-color'
import { colors } from '../theme/mobile-theme'
import type { MobilePrRowModel } from '../worktree/mobile-pr-row-model'
import { workspaceRowStyles } from './mobile-session-workspace-rows-styles'

type Props = {
  model: MobilePrRowModel
  onPress: () => void
}

/**
 * The session screen's PR row (#99): the linked PR's number and state. Tapping routes
 * to the existing PR surface (the source-control hub's PR segment) via
 * mobile-session-pr-row-route.ts — never a new screen. The caller renders this row
 * only when buildMobilePrRowModel found a linked PR; there is no "no PR" state here.
 */
export function MobileSessionPrRow({ model, onPress }: Props) {
  const color = statusColor(model.stateToken)
  return (
    <Pressable
      style={({ pressed }) => [workspaceRowStyles.row, pressed && workspaceRowStyles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pull request #${model.number}, ${model.stateLabel}. Open pull request.`}
    >
      <View style={workspaceRowStyles.rowMain}>
        <View style={workspaceRowStyles.rowValueGroup}>
          <GitPullRequest size={15} color={colors.textSecondary} strokeWidth={2.1} />
          <Text style={workspaceRowStyles.prNumber}>{`#${model.number}`}</Text>
          <View style={[workspaceRowStyles.statePill, { borderColor: color }]}>
            <Text style={[workspaceRowStyles.statePillText, { color }]}>{model.stateLabel}</Text>
          </View>
        </View>
        <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.1} />
      </View>
    </Pressable>
  )
}
