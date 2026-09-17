import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, CircleUserRound, History, LayoutDashboard, Ruler, Settings2, ShieldCheck, Target, UtensilsCrossed } from 'lucide-react-native';
import { Avatar } from '@/components/ui';
import { Colors, Fonts, Radii, Typography } from '@/constants/theme';
import { useAuthStore, selectIsAdmin } from '@/store/authStore';
import { fullDate } from '@/lib/format';

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const isAdmin = useAuthStore(selectIsAdmin);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>MORE</Text>
        <Pressable style={styles.identity} onPress={() => router.push('/personal-details' as never)} accessibilityRole="button" accessibilityLabel="Open personal details">
          <Avatar name={profile?.full_name ?? profile?.email} size={82} />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>{profile?.full_name || 'Your HaverTrack'}</Text>
            <Text style={styles.member} numberOfLines={1}>Member since {fullDate(profile?.created_at)}</Text>
          </View>
        </Pressable>

        <SettingsGroup title="General">
          <SettingsRow icon={<CircleUserRound />} label="Account" onPress={() => router.push('/account-settings' as never)} />
          <SettingsRow icon={<Ruler />} label="Units" last onPress={() => router.push('/units' as never)} />
        </SettingsGroup>
        <SettingsGroup title="Health settings">
          <SettingsRow icon={<CircleUserRound />} label="Personal details" onPress={() => router.push('/personal-details' as never)} />
          <SettingsRow icon={<Target />} label="Nutrition targets" onPress={() => router.push('/edit-goals' as never)} />
          <SettingsRow icon={<History />} label="Weight history" onPress={() => router.push('/weight-history' as never)} />
          <SettingsRow icon={<Bell />} label="Meal reminders" last onPress={() => router.push('/notification-settings' as never)} />
        </SettingsGroup>
        <SettingsGroup title="Feature settings">
          <SettingsRow icon={<LayoutDashboard />} label="Dashboard" onPress={() => router.push('/account-settings' as never)} />
          <SettingsRow icon={<UtensilsCrossed />} label="Saved meals" last onPress={() => router.push('/log/saved' as never)} />
        </SettingsGroup>
        <SettingsGroup title="About">
          <SettingsRow icon={<Settings2 />} label="HaverTrack plan" subtitle="Free for Haverford students" onPress={() => Alert.alert('HaverTrack plan', 'HaverTrack is currently free for Haverford students.')} last={!isAdmin} />
          {isAdmin ? <SettingsRow icon={<ShieldCheck />} label="Admin console" last onPress={() => router.push('/admin' as never)} /> : null}
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.group}>{children}</View></View>;
}

function SettingsRow({ icon, label, subtitle, last = false, onPress }: { icon: React.ReactElement<{ size?: number; color?: string }>; label: string; subtitle?: string; last?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.row, last && styles.lastRow]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.icon}>{React.cloneElement(icon, { size: 23, color: Colors.ink })}</View>
      <View style={styles.rowText}><Text style={styles.rowLabel}>{label}</Text>{subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}</View>
      <ChevronRight size={24} color="#A9A9AD" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F6' },
  content: { paddingTop: 32, paddingBottom: 46 },
  heading: { fontFamily: Fonts.outfit.extraBold, fontSize: 38, letterSpacing: -1.7, color: Colors.ink, marginHorizontal: 28, marginBottom: 30 },
  identity: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, marginBottom: 38 },
  identityText: { marginLeft: 18, flex: 1 },
  name: { ...Typography.displayM, fontSize: 25, color: Colors.ink },
  member: { ...Typography.bodyL, color: Colors.textMuted, marginTop: 4 },
  section: { marginBottom: 34 },
  sectionTitle: { ...Typography.displayM, fontSize: 28, marginHorizontal: 28, marginBottom: 16 },
  group: { marginHorizontal: 28, backgroundColor: Colors.surface, borderRadius: Radii.card, overflow: 'hidden' },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0E0E2' },
  lastRow: { borderBottomWidth: 0 },
  icon: { width: 40, alignItems: 'flex-start' },
  rowText: { flex: 1 },
  rowLabel: { ...Typography.title, fontSize: 21, color: Colors.ink },
  rowSubtitle: { ...Typography.micro, color: Colors.textMuted, marginTop: 1 },
});
