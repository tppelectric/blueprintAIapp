import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "AI Blueprint Scan" }} />
      <Stack.Screen name="takeoff" options={{ title: "Takeoff Snapshot" }} />
    </Stack>
  );
}
