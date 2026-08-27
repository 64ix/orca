import { ChevronRight } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import type { MobileStageRowModel } from '../worktree/mobile-stage-row-model'
import { workspaceRowStyles } from './mobile-session-workspace-rows-styles'

type Props = {
  model: MobileStageRowModel
  onPress: () => void
}

/**
 * The session screen's stage row (#99): the effective stage, and why it may differ
 * from the declaration when a fact governs it. Tapping opens the same stage action
 * sheet as the board (#98's models, via mobile-session-stage-sheet.ts) — never a
 * reimplemented decision.
 */
export function MobileSessionStageRow({ model, onPress }: Props) {
  const explanationLine = model.shippedSourceLabel
    ? `${model.shippedSourceLabel} · ${model.explanation}`
    : model.explanation
  return (
    <Pressable
      style={({ pressed }) => [workspaceRowStyles.row, pressed && workspaceRowStyles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Stage: ${model.stageLabel}. ${model.explanation}`}
    >
      <View style={workspaceRowStyles.rowMain}>
        <Text style={workspaceRowStyles.rowLabel}>Stage</Text>
        <View style={workspaceRowStyles.rowValueGroup}>
          <Text style={workspaceRowStyles.rowValue}>{model.stageLabel}</Text>
          <ChevronRight size={16} color={colors.textMuted} strokeWidth={2.1} />
        </View>
      </View>
      <Text style={workspaceRowStyles.rowExplanation} numberOfLines={2}>
        {explanationLine}
      </Text>
    </Pressable>
  )
}
