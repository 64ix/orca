import { useLocalSearchParams } from 'expo-router'
import { MobileStageBoardPanel } from '../../../src/worktree/MobileStageBoardPanel'

export default function MobileStageBoardScreen() {
  const { hostId } = useLocalSearchParams<{ hostId?: string }>()
  return <MobileStageBoardPanel hostId={hostId} />
}
