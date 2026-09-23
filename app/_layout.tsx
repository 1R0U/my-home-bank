import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        {/* (adult) はTabsレイアウトを持つルートグループ。ここでheaderShownを
            明示しないと、グループ全体に対する素のネイティブヘッダーが表示されてしまう。 */}
        <Stack.Screen name="(adult)" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
