import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card } from '@/components/ui';
import { CheckCircle2, XCircle, Flame, Shield } from 'lucide-react-native';
import {
  useAdminUserDetail,
  useAdminUserActivity,
  compactNumber,
  fullDate,
  relativeTime,
} from '@/lib/admin';
import { ColumnChart, ChartEmpty } from '../_charts';

export default function AdminUserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useAdminUserDetail(id ?? '');
  const activity = useAdminUserActivity(id ?? '', 30);

  const u = detail.data;

  if (detail.isLoading) {
    return (
      <View style={styles.loadingBlock}>
        <ActivityIndicator color={Colors.scarlet} />
      </View>
    );
  }

  if (detail.isError || !u) {
    return (
      <View style={styles.container}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {detail.error?.message || 'This student record could not be loaded.'}
          </Text>
        </View>
      </View>
    );
  }

  const activityColumns = (activity.data ?? []).map((d) => ({
    label: new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric' }),
    value: d.meals,
    emphasis: d.scan_meals > 0,
  }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.nameRow}>
          <Text style={Typography.displayL}>{u.full_name || 'Unnamed student'}</Text>
          {u.role === 'admin' ? (
            <View style={styles.adminBadge}>
              <Shield size={12} color={Colors.scarlet} />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          ) : null}
        </View>
        <Text style={[Typography.bodyS, { color: Colors.textMuted, marginTop: 4 }]}>{u.email}</Text>
        <View style={styles.verifyRow}>
          {u.college_verified ? (
            <CheckCircle2 size={14} color={Colors.green} />
          ) : (
            <XCircle size={14} color={Colors.textFaint} />
          )}
          <Text style={styles.verifyText}>
            {u.college_verified ? `Verified · ${u.college_email}` : 'Not verified'}
          </Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <MetaTile label="Joined" value={fullDate(u.joined_at)} />
        <MetaTile label="Email confirmed" value={u.email_confirmed_at ? fullDate(u.email_confirmed_at) : 'No'} />
        <MetaTile label="Class year" value={u.class_year ? String(u.class_year) : '—'} />
        <MetaTile label="Onboarded" value={u.onboarded_at ? fullDate(u.onboarded_at) : 'Not yet'} />
        <MetaTile label="Last active" value={relativeTime(u.last_active_at)} />
        <MetaTile label="Units" value={u.units ? u.units[0].toUpperCase() + u.units.slice(1) : '—'} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>GOAL</Text>
        <Card style={styles.card}>
          <View style={styles.goalRow}>
            <Text style={Typography.title}>{goalLabel(u.goal_type)}</Text>
            {u.calorie_target ? (
              <Text style={[Typography.bodyS, { color: Colors.textMuted }]}>{u.calorie_target} kcal/day</Text>
            ) : null}
          </View>
          {u.protein_g || u.carbs_g || u.fat_g ? (
            <Text style={[Typography.caption, { color: Colors.textFaint, marginTop: 6 }]}>
              {u.protein_g ?? 0}P / {u.carbs_g ?? 0}C / {u.fat_g ?? 0}F g
            </Text>
          ) : null}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>LOGGING</Text>
        <View style={styles.statGrid}>
          <StatBox label="Total meals" value={compactNumber(u.total_meals)} />
          <StatBox label="Days logged" value={compactNumber(u.days_logged)} />
          <StatBox label="Meals (7d)" value={compactNumber(u.meals_7d)} />
          <StatBox label="Meals (30d)" value={compactNumber(u.meals_30d)} />
          <StatBox label="Avg kcal (7d)" value={compactNumber(u.avg_calories_7d)} />
          <StatBox label="Avg kcal (30d)" value={compactNumber(u.avg_calories_30d)} />
        </View>

        <View style={styles.streakCard}>
          <Flame size={16} color={Colors.gold} />
          <Text style={styles.streakLabel}>
            {u.current_streak} day{u.current_streak === 1 ? '' : 's'} current streak
          </Text>
          <Text style={styles.streakRange}>
            {u.first_logged_date ? `first log ${fullDate(u.first_logged_date)}` : 'no logs yet'}
          </Text>
        </View>

        <Card style={[styles.card, { marginTop: 12 }]}>
          <Text style={[Typography.monoLabel, { marginBottom: 10 }]}>MEALS PER DAY · LAST 30D</Text>
          {activity.isLoading ? (
            <View style={styles.loadingBlockSmall}>
              <ActivityIndicator color={Colors.scarlet} />
            </View>
          ) : activityColumns.some((c) => c.value > 0) ? (
            <ColumnChart data={activityColumns} maxLabels={6} emphasisOnly />
          ) : (
            <ChartEmpty message="No logging activity in the last 30 days." />
          )}
          <Text style={styles.legendNote}>Highlighted days include a camera scan.</Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>LOG SOURCE</Text>
        <View style={styles.sourceRow}>
          <SourcePill label="Scan" value={u.scan_meals} color="#9E1B32" />
          <SourcePill label="Menu" value={u.menu_meals} color="#B8801A" />
          <SourcePill label="Manual" value={u.manual_meals} color="#15803D" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>OTHER ACTIVITY</Text>
        <View style={styles.statGrid}>
          <StatBox label="Weigh-ins" value={compactNumber(u.weight_entry_count)} />
          <StatBox label="Saved meals" value={compactNumber(u.favorite_count)} />
        </View>
      </View>

      <Text style={styles.footnote}>
        Meal photos and individual weight values are not shown here. Opening this record was logged.
      </Text>
    </ScrollView>
  );
}

function goalLabel(type: string | null) {
  switch (type) {
    case 'lose':
      return 'Gentle fat loss';
    case 'gain':
      return 'Muscle gain';
    case 'maintain':
      return 'Maintenance';
    case 'tracking':
      return 'Just tracking';
    default:
      return 'Not set';
  }
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaTile}>
      <Text style={styles.metaTileLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.metaTileValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxValue}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

function SourcePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.sourcePill}>
      <View style={[styles.sourceDot, { backgroundColor: color }]} />
      <Text style={styles.sourcePillLabel}>{label}</Text>
      <Text style={styles.sourcePillValue}>{compactNumber(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, backgroundColor: Colors.cream },
  loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.cream },
  loadingBlockSmall: { paddingVertical: 24, alignItems: 'center' },
  header: { marginBottom: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBEAED',
    borderRadius: Radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  adminBadgeText: { fontFamily: Fonts.outfit.semiBold, fontSize: 11, color: Colors.scarlet },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  verifyText: { ...Typography.caption, color: Colors.textMuted },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  metaTile: {
    width: '31.5%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
  },
  metaTileLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 9.5,
    letterSpacing: 0.6,
    color: Colors.textFaint,
  },
  metaTileValue: { fontFamily: Fonts.outfit.semiBold, fontSize: 13, color: Colors.ink, marginTop: 4 },
  section: { marginTop: 26 },
  sectionEyebrow: { ...Typography.monoLabel, marginBottom: 10, color: Colors.textMuted },
  card: { padding: 16 },
  goalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: {
    width: '31.5%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  statBoxValue: { fontFamily: Fonts.outfit.bold, fontSize: 20, color: Colors.ink },
  statBoxLabel: { ...Typography.micro, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#FDF7E7',
    borderRadius: Radii.card,
    padding: 12,
  },
  streakLabel: { fontFamily: Fonts.outfit.semiBold, fontSize: 13, color: '#8A5D00', flex: 1 },
  streakRange: { ...Typography.micro, color: '#8A5D00' },
  legendNote: { ...Typography.micro, color: Colors.textFaint, marginTop: 8 },
  sourceRow: { flexDirection: 'row', gap: 10 },
  sourcePill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
  },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  sourcePillLabel: { ...Typography.micro, color: Colors.textMuted },
  sourcePillValue: { fontFamily: Fonts.outfit.bold, fontSize: 16, color: Colors.ink, marginTop: 2 },
  footnote: { ...Typography.micro, color: Colors.textFaint, textAlign: 'center', marginTop: 30 },
  errorBox: {
    backgroundColor: '#FBEAED',
    borderWidth: 1,
    borderColor: 'rgba(158,27,50,0.28)',
    borderRadius: Radii.card,
    padding: 14,
  },
  errorText: { ...Typography.bodyS, color: Colors.scarlet },
});
