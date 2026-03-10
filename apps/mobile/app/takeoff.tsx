import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchProjectTakeoff } from "../features/api";
import { takeoffSnapshot } from "../features/mockData";

type TakeoffRow = {
  room: string;
  outlets: number;
  switches: number;
  lights: number;
};

export default function TakeoffScreen() {
  const [rows, setRows] = useState<TakeoffRow[]>(takeoffSnapshot);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchProjectTakeoff("p-001");
        if (!payload.takeoffs || payload.takeoffs.length === 0) {
          return;
        }

        setRows(
          payload.takeoffs.map((item) => ({
            room: item.roomName,
            outlets: item.counts.outlet,
            switches: item.counts.switch,
            lights: item.counts.light + item.counts.recessed_light
          }))
        );
      } catch {
        // Keep fallback takeoff snapshot for offline or unavailable API.
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Room Takeoff Snapshot</Text>
        {rows.map((item) => (
          <View key={item.room} style={styles.card}>
            <Text style={styles.room}>{item.room}</Text>
            <Text>Outlets: {item.outlets}</Text>
            <Text>Switches: {item.switches}</Text>
            <Text>Lights: {item.lights}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7f8fa"
  },
  container: {
    padding: 16,
    gap: 10
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8
  },
  card: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 3
  },
  room: {
    fontWeight: "700"
  }
});
