import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  Newsreader_300Light_Italic,
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getEngine } from './src/platform/db';
import { haptic } from './src/platform/haptics';
import { installNotificationRouting } from './src/platform/notify';
import { onShake } from './src/platform/shake';
import { nav, type Keyed } from './src/state/nav';
import { AutopilotScreen } from './src/screens/AutopilotScreen';
import { GraphScreen } from './src/screens/GraphScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { NodeScreen } from './src/screens/NodeScreen';
import { ObserverScreen } from './src/screens/ObserverScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrashScreen } from './src/screens/TrashScreen';
import { ThemeProvider, usePalette } from './src/theme/ThemeProvider';
import { CommandPalette } from './src/ui/CommandPalette';
import { Navigator } from './src/ui/Navigator';
import { ReminderSheet } from './src/ui/ReminderSheet';
import { Toast } from './src/ui/Toast';
import { applyDevRoute } from './src/platform/devRoute';

SplashScreen.preventAutoHideAsync().catch(() => {});
// Synchronous boot: SQLite (WAL) → in-memory mirror, before the first frame.
getEngine();

function render(r: Keyed) {
  switch (r.name) {
    case 'home':
      return <HomeScreen />;
    case 'node':
      return <NodeScreen id={r.id} />;
    case 'graph':
      return <GraphScreen focus={r.focus} />;
    case 'observer':
      return <ObserverScreen id={r.id} />;
    case 'autopilot':
      return <AutopilotScreen scope={r.scope} startId={r.startId} />;
    case 'settings':
      return <SettingsScreen />;
    case 'trash':
      return <TrashScreen />;
  }
}

function Root() {
  const c = usePalette();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);
  useEffect(() => {
    const off = installNotificationRouting();
    applyDevRoute();
    const offShake = onShake(() => {
      const label = getEngine().undo();
      if (label) {
        haptic.lens();
        nav().showToast(`Geri alındı · ${label}`, false);
      }
    });
    return () => {
      off();
      offShake();
    };
  }, []);
  return (
    <>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Navigator render={render} />
      <ReminderSheet />
      <CommandPalette />
      <Toast />
    </>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Newsreader_300Light_Italic,
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
