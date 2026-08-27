import { StyleSheet } from 'react-native'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'

export const boardStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  titleWrap: {
    flex: 1
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary
  },
  subheading: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    marginTop: 1
  },
  chipStrip: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  chipActive: {
    backgroundColor: colors.bgRaised,
    borderColor: colors.textSecondary
  },
  chipLabel: {
    fontSize: typography.metaSize,
    fontWeight: '600',
    color: colors.textSecondary
  },
  chipLabelActive: {
    color: colors.textPrimary
  },
  chipCount: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.bgBase,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden'
  },
  page: {
    flex: 1
  },
  pageContent: {
    padding: spacing.md,
    gap: spacing.sm
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.xl
  },
  emptyStateText: {
    fontSize: typography.bodySize,
    color: colors.textMuted,
    textAlign: 'center'
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  placeholderText: {
    fontSize: typography.bodySize,
    color: colors.textMuted
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md
  },
  cardPressed: {
    backgroundColor: colors.bgRaised
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  cardName: {
    flex: 1,
    fontSize: typography.bodySize,
    fontWeight: '600',
    color: colors.textPrimary
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  cardRepo: {
    fontSize: typography.metaSize,
    color: colors.textSecondary
  },
  cardBranch: {
    flex: 1,
    fontSize: typography.metaSize,
    color: colors.textMuted,
    fontFamily: typography.monoFamily
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  prNumber: {
    fontSize: 10,
    fontWeight: '600'
  },
  folderBadge: {
    backgroundColor: colors.bgRaised,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  folderBadgeText: {
    fontSize: 10,
    color: colors.textSecondary
  },
  sheetHint: {
    marginTop: 2,
    fontSize: typography.metaSize,
    color: colors.textMuted
  }
})
