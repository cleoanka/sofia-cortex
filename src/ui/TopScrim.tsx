import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Content dissolves under the status bar instead of colliding with it. */
export function TopScrim({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[color, color + 'F2', color + '00']}
      locations={[0, 0.55, 1]}
      style={[StyleSheet.absoluteFill, { bottom: undefined, height: insets.top + 18 }]}
    />
  );
}
