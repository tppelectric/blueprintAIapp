import { Link } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import { fetchProjectDashboard } from "../features/api";
import { mobileSummary } from "../features/mockData";

export default function HomeScreen() {
  const [summary, setSummary] = useState(mobileSummary);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await fetchProjectDashboard("p-001");
        if (!payload.dashboard) {
          return;
        }

        setSummary({
          projectName: payload.dashboard.project.name,
          location: payload.dashboard.project.location,
          roomCount: payload.dashboard.rooms.length,
          symbolCount: payload.dashboard.symbols.length,
          reviewQueue: payload.dashboard.symbols.filter((item) => item.needsReview).length,
          materialLines: payload.dashboard.materials.length
        });
      } catch {
        // Keep fallback summary for offline or unavailable API.
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>AI Blueprint Scan App</Text>
        <Text style={styles.subtitle}>{summary.projectName}</Text>
        <Text style={styles.subtitle}>{summary.location}</Text>

        <View style={styles.card}>
          <Text>Rooms: {summary.roomCount}</Text>
          <Text>Detected symbols: {summary.symbolCount}</Text>
          <Text>Needs review: {summary.reviewQueue}</Text>
          <Text>Material lines: {summary.materialLines}</Text>
        </View>

        <Link href="/takeoff" style={styles.link}>
          Open Takeoff Snapshot
        </Link>

        <StatusBar style="dark" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7f8fa"
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  subtitle: {
    fontSize: 14,
    color: "#475467"
  },
  card: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    gap: 4,
    marginTop: 12
  },
  link: {
    marginTop: 12,
    color: "#0055a5",
    fontWeight: "600"
  }
});
