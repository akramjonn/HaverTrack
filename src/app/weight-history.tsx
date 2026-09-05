import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Scale } from 'lucide-react-native';
import { Colors, Typography } from '@/constants/theme';
import { Card, IconButton } from '@/components/ui';
import { useLogStore } from '@/store/logStore';
import { formatWeight, useUnits } from '@/lib/units';
import { fullDate } from '@/lib/format';

export default function WeightHistoryScreen() {
  const router = useRouter();
  const units = useUnits();
  const weightEntries = useLogStore((s) => s.weightEntries);

  // Store keeps entries oldest-first (sorted by `recorded_on` ascending, see
  // `addWeightEntry` in `src/store/logStore.ts`), so reverse for most-recent-first.
  const entries = [...weightEntries].reverse();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={[Typography.title, { marginLeft: 12 }]}>Weight History</Text>
      </View>

      {entries.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Scale size={22} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>
            No weight entries yet — log one from the Progress tab.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {entries.map((entry, index) => (
              <View
                key={entry.id}
                style={[
                  styles.row,
                  index === entries.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={Typography.bodySSemiBold}>
                  {formatWeight(entry.weight_kg, units)}
                </Text>
                <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>
                  {fullDate(entry.recorded_on)}
                </Text>
              </View>
            ))}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
