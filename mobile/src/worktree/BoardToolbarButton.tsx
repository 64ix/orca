import { LayoutGrid } from 'lucide-react-native'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { colors } from '../theme/mobile-theme'

type Props = {
  style: StyleProp<ViewStyle>
  connected: boolean
  onPress: () => void
}

/** Host-list toolbar entry point to the stage board (#98), shared by the embedded (tablet
 *  sidebar) and phone toolbars so the button isn't duplicated inline in both layouts. */
export function BoardToolbarButton({ style, connected, onPress }: Props) {
  return (
    <Pressable
      style={style}
      onPress={onPress}
      disabled={!connected}
      accessibilityRole="button"
      accessibilityLabel="Board"
    >
      <LayoutGrid size={16} color={connected ? colors.textSecondary : colors.textMuted} />
    </Pressable>
  )
}
