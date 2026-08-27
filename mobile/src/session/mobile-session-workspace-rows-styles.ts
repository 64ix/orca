import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

/** The session screen's stage/PR rows (#99) — styled like a settings row, matching
 *  the board's card/chip treatment (mobile-stage-board-styles.ts) rather than
 *  inventing a new visual language. */
export const workspaceRowStyles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  rowPressed: {
    backgroundColor: colors.bgRaised
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  rowLabel: {
    fontSize: typography.metaSize,
    color: colors.textSecondary
  },
  rowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  rowValue: {
    fontSize: typography.bodySize,
    fontWeight: '600',
    color: colors.textPrimary
  },
  rowExplanation: {
    marginTop: 2,
    fontSize: typography.metaSize,
    color: colors.textMuted
  },
  prNumber: {
    fontSize: typography.bodySize,
    fontWeight: '700',
    color: colors.textPrimary
  },
  statePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radii.button,
    borderWidth: StyleSheet.hairlineWidth
  },
  statePillText: {
    fontSize: typography.metaSize,
    fontWeight: '700'
  }
})
