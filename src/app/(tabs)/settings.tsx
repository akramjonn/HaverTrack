import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Button, Input, IconButton, Avatar } from '@/components/ui';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  ChevronRight,
  UserCircle,
  History,
} from 'lucide-react-native';
import { useAuthStore, selectIsAdmin, type UserProfile, type EditableProfile } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { loggingStreak } from '@/lib/stats';
import { fullDate } from '@/lib/format';

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const isAdmin = useAuthStore(selectIsAdmin);
  const logs = useLogStore((state) => state.logs);

  const streak = loggingStreak(logs).current;
  const totalMeals = logs.length;
  const daysLogged = new Set(logs.map((l) => l.logged_date)).size;
  const memberSince = fullDate(profile?.created_at);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerIdentity}>
            <Avatar name={profile?.full_name ?? profile?.email} size={64} />
            <View style={styles.headerText}>
              <Text style={Typography.displayM} numberOfLines={1}>
                {profile?.full_name || 'You'}
              </Text>
              <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                {profile?.email || ''}
              </Text>
              {profile?.class_year ? (
                <Text style={[Typography.caption, { color: Colors.textFaint, marginTop: 2 }]}>
                  Class of {profile.class_year}
                </Text>
              ) : null}
            </View>
          </View>
          <IconButton
            icon={<SettingsIcon size={18} color={Colors.inkSoft} />}
            onPress={() => router.push('/account-settings' as any)}
            accessibilityLabel="Account settings"
            shape="circle"
            variant="light"
          />
        </View>

        {isAdmin ? (
          <Card
            onPress={() => router.push('/(admin)' as any)}
            accessibilityLabel="Open admin console"
            style={styles.adminRow}
          >
            <ShieldCheck size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={Typography.bodySSemiBold}>Admin console</Text>
              <Text style={Typography.caption}>Signups, engagement, and menu health</Text>
            </View>
            <ChevronRight size={16} color={Colors.textMuted} />
          </Card>
        ) : null}

        {/* Editable identity — name + class year */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>ABOUT YOU</Text>
          <Card style={styles.card}>
            <NameField
              key={profile?.id ?? 'anon'}
              profile={profile}
              updateProfile={updateProfile}
            />
          </Card>
        </View>

        {/* Stats row */}
        <View style={styles.statGrid}>
          <StatBox label="Streak" value={`${streak}`} />
          <StatBox label="Total meals" value={`${totalMeals}`} />
          <StatBox label="Days logged" value={`${daysLogged}`} />
          <StatBox label="Member since" value={memberSince} />
        </View>

        {/* Current Plan Card */}
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={Typography.monoLabel}>CURRENT GOAL</Text>
              <Text style={[Typography.title, { marginTop: 4 }]}>
                {goal?.goal_type === 'tracking'
                  ? 'Just Tracking'
                  : goal?.goal_type === 'lose'
                  ? 'Gentle Fat Loss (0.5 lb/wk)'
                  : goal?.goal_type === 'gain'
                  ? 'Muscle Gain (+250 kcal)'
                  : 'Maintenance'}
              </Text>
              <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
                {goal?.calorie_target ? `${goal.calorie_target} kcal/day` : 'No calorie limits applied'}
              </Text>
            </View>
            <Button
              label="Edit"
              variant="secondary"
              onPress={() => router.push('/edit-goals' as any)}
              style={{ height: 38, paddingHorizontal: 16 }}
            />
          </View>
        </Card>

        {/* Navigation to Personal Details (body metrics, goal weight, gender,
            daily step goal) and Weight History — both moved to their own
            pushed screens rather than living inline here. */}
        <View style={styles.section}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => router.push('/personal-details' as any)}
              accessibilityRole="button"
              accessibilityLabel="Open personal details"
              style={styles.menuRow}
            >
              <UserCircle size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Personal details</Text>
                <Text style={Typography.caption}>Body metrics, gender, goal weight</Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/weight-history' as any)}
              accessibilityRole="button"
              accessibilityLabel="Open weight history"
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <History size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Weight history</Text>
                <Text style={Typography.caption}>See all logged weight entries</Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface NameFieldProps {
  profile: UserProfile | null;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
}

/**
 * Name + class year editor. Mounted with `key={profile.id}` from the parent
 * so its local text state is *initialized* fresh from `profile` whenever
 * identity changes, rather than an effect re-syncing it after the fact —
 * the same idiom used by `PersonalDetailsForm` on `/personal-details`.
 */
function NameField({ profile, updateProfile }: NameFieldProps) {
  const [nameText, setNameText] = useState(profile?.full_name ?? '');
  const [classYearText, setClassYearText] = useState(
    profile?.class_year != null ? String(profile.class_year) : ''
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleSaveProfile = async () => {
    setProfileError(null);

    let class_year: number | null = null;
    if (classYearText.trim()) {
      const parsedYear = parseInt(classYearText.trim(), 10);
      if (isNaN(parsedYear) || parsedYear <= 0) {
        setProfileError('Class year must be a number.');
        return;
      }
      class_year = parsedYear;
    }

    setSavingProfile(true);
    try {
      await updateProfile({ full_name: nameText.trim() || null, class_year });
    } catch (err: any) {
      setProfileError(err?.message ?? 'Could not save your details.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <>
      <Input
        label="NAME"
        value={nameText}
        onChangeText={(t) => {
          setNameText(t);
          setProfileError(null);
        }}
        placeholder="Your name"
        containerStyle={{ marginBottom: 12 }}
      />

      <Input
        label="CLASS YEAR"
        value={classYearText}
        onChangeText={(t) => {
          setClassYearText(t);
          setProfileError(null);
        }}
        keyboardType="numeric"
        placeholder="2027"
        containerStyle={{ marginBottom: 4 }}
      />

      {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}

      <Button
        label="Save profile"
        variant="secondary"
        onPress={handleSaveProfile}
        loading={savingProfile}
        style={{ marginTop: 8 }}
      />
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerText: {
    marginLeft: 14,
    flexShrink: 1,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    marginBottom: 20,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  errorText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginBottom: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  statBoxValue: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 20,
    color: Colors.ink,
  },
  statBoxLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
