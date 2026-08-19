import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Chip } from '@/components/ui';
import { Search, ChevronRight, CheckCircle2, Flame } from 'lucide-react-native';
import { useAdminRoster, AdminRosterRow, compactNumber, relativeTime, adminKeys } from '@/lib/admin';

type SortKey = 'joined' | 'active' | 'meals' | 'streak';

const SORTERS: Record<SortKey, (a: AdminRosterRow, b: AdminRosterRow) => number> = {
  joined: (a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime(),
  active: (a, b) =>
    new Date(b.last_active_at ?? 0).getTime() - new Date(a.last_active_at ?? 0).getTime(),
  meals: (a, b) => b.total_meals - a.total_meals,
  streak: (a, b) => b.current_streak - a.current_streak,
};

const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: 'active', label: 'Last active' },
  { key: 'joined', label: 'Joined' },
  { key: 'meals', label: 'Meals' },
  { key: 'streak', label: 'Streak' },
];

export default function AdminUsersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const roster = useAdminRoster(debounced);

  const sorted = useMemo(() => {
    return [...(roster.data ?? [])].sort(SORTERS[sortKey]);
  }, [roster.data, sortKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: adminKeys.roster(debounced) });
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.scarlet} />}
    >
      <View style={styles.searchWrapper}>
        <Search size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search name or email"
          placeholderTextColor={Colors.textGhost}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.sortRow}>
        {SORT_LABELS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={sortKey === s.key}
            onPress={() => setSortKey(s.key)}
          />
        ))}
      </View>

      {roster.isLoading && !roster.data ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={Colors.scarlet} />
        </View>
      ) : roster.isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{roster.error?.message || 'Could not load students.'}</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>
            {debounced ? `No students match "${debounced}".` : 'No students yet.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.countLabel}>
            {sorted.length} student{sorted.length === 1 ? '' : 's'}
          </Text>
          {sorted.map((u) => (
            <Pressable
              key={u.user_id}
              onPress={() => router.push(`/(admin)/users/${u.user_id}` as never)}
            >
              <Card style={styles.rowCard}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <Text style={Typography.bodySSemiBold} numberOfLines={1}>
                      {u.full_name || u.email}
                    </Text>
                    {u.college_verified ? (
                      <CheckCircle2 size={14} color={Colors.green} style={{ marginLeft: 6 }} />
                    ) : null}
                  </View>
                  <Text style={styles.email} numberOfLines={1}>
                    {u.email}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>Joined {relativeTime(u.joined_at)}</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>Active {relativeTime(u.last_active_at)}</Text>
                  </View>
                </View>

                <View style={styles.statsCol}>
                  <View style={styles.statPair}>
                    <Text style={styles.statValue}>{compactNumber(u.total_meals)}</Text>
                    <Text style={styles.statLabel}>meals</Text>
                  </View>
                  {u.current_streak > 0 ? (
                    <View style={styles.streakPill}>
                      <Flame size={11} color={Colors.gold} />
                      <Text style={styles.streakText}>{u.current_streak}</Text>
                    </View>
                  ) : null}
                </View>

                <ChevronRight size={16} color={Colors.textMuted} style={{ marginLeft: 6 }} />
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: Colors.cream },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.ink },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  loadingBlock: { paddingVertical: 60, alignItems: 'center' },
  emptyBlock: { paddingVertical: 40, alignItems: 'center' },
  list: { gap: 10 },
  countLabel: { ...Typography.monoLabel, color: Colors.textMuted, marginBottom: 2 },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  email: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  metaText: { ...Typography.micro, color: Colors.textFaint },
  metaDot: { ...Typography.micro, color: Colors.textFaint, marginHorizontal: 5 },
  statsCol: { alignItems: 'flex-end', marginLeft: 10, gap: 4 },
  statPair: { alignItems: 'flex-end' },
  statValue: { fontFamily: Fonts.mono.medium, fontSize: 15, color: Colors.ink },
  statLabel: { ...Typography.micro, color: Colors.textFaint },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FDF7E7',
    borderRadius: Radii.pill,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  streakText: { fontFamily: Fonts.mono.medium, fontSize: 11, color: '#8A5D00' },
  errorBox: {
    backgroundColor: '#FBEAED',
    borderWidth: 1,
    borderColor: 'rgba(158,27,50,0.28)',
    borderRadius: Radii.card,
    padding: 14,
  },
  errorText: { ...Typography.bodyS, color: Colors.scarlet },
});
