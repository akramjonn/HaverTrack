import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Button, Input, SegmentedControl, IconButton, Avatar } from '@/components/ui';
import { Settings as SettingsIcon, ShieldCheck, ChevronRight, Ruler } from 'lucide-react-native';
import { useAuthStore, selectIsAdmin, type UserProfile, type EditableProfile } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { formatHeight, formatWeight, parseHeightInput, parseWeightToKg, type Units } from '@/lib/units';
import { loggingStreak } from '@/lib/stats';
import { fullDate } from '@/lib/format';

export default function SettingsScreen() {
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const isAdmin = useAuthStore(selectIsAdmin);
  const logs = useLogStore((state) => state.logs);

  const units: Units = profile?.units ?? 'imperial';
  const [savingUnits, setSavingUnits] = useState(false);

  const handleUnitsChange = async (next: Units) => {
    if (next === units) return;
    setSavingUnits(true);
    try {
      await updateProfile({ units: next });
    } catch (err: any) {
      Alert.alert('Could not update units', err?.message ?? 'Please try again.');
    } finally {
      setSavingUnits(false);
    }
  };

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

        {/* Body Metrics — units toggle + editable height/weight/age. This is
            the only place height can be changed after onboarding. */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>BODY METRICS</Text>
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.rowInline}>
                <Ruler size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                <Text style={Typography.monoLabel}>UNITS</Text>
              </View>
            </View>
            <SegmentedControl
              options={[
                { value: 'imperial', label: 'Imperial' },
                { value: 'metric', label: 'Metric' },
              ]}
              value={units}
              onChange={handleUnitsChange}
              style={{ marginTop: 10, marginBottom: 20, opacity: savingUnits ? 0.6 : 1 }}
            />

            {/* Keyed by profile id + units: the field values below are only
                ever an *initial* render of external state, so a remount on
                either changing is the correct reset — not an effect that
                calls setState after the fact. */}
            <BodyMetricsFields
              key={`${profile?.id ?? 'anon'}-${units}`}
              profile={profile}
              units={units}
              updateProfile={updateProfile}
            />
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
 * mirrors `BodyMetricsFields`'s exact idiom below.
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

interface BodyMetricsFieldsProps {
  profile: UserProfile | null;
  units: Units;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
}

/**
 * Height/weight/age editor. Mounted with `key={profileId-units}` from the
 * parent so its local text state is *initialized* fresh from `profile`
 * whenever either changes, rather than an effect re-syncing it after the
 * fact — a remount is the correct reset here, not a setState-in-effect.
 */
function BodyMetricsFields({ profile, units, updateProfile }: BodyMetricsFieldsProps) {
  const [heightText, setHeightText] = useState(
    profile?.height_cm ? formatHeight(profile.height_cm, units) : ''
  );
  const [weightText, setWeightText] = useState(
    profile?.weight_kg ? formatWeight(profile.weight_kg, units) : ''
  );
  const [ageText, setAgeText] = useState(profile?.age != null ? String(profile.age) : '');
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [savingMetrics, setSavingMetrics] = useState(false);

  const handleSaveMetrics = async () => {
    setMetricsError(null);

    const height_cm = heightText.trim() ? parseHeightInput(heightText, units) : null;
    if (heightText.trim() && height_cm === null) {
      setMetricsError('Could not read that height.');
      return;
    }

    const weight_kg = weightText.trim() ? parseWeightToKg(weightText, units) : null;
    if (weightText.trim() && weight_kg === null) {
      setMetricsError('Could not read that weight.');
      return;
    }

    let age: number | null = null;
    if (ageText.trim()) {
      const parsedAge = parseInt(ageText.trim(), 10);
      if (isNaN(parsedAge) || parsedAge <= 0) {
        setMetricsError('Age must be a number.');
        return;
      }
      age = parsedAge;
    }

    setSavingMetrics(true);
    try {
      await updateProfile({ height_cm, weight_kg, age });
    } catch (err: any) {
      setMetricsError(err?.message ?? 'Could not save your details.');
    } finally {
      setSavingMetrics(false);
    }
  };

  return (
    <>
      <View style={styles.rowGrid}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Input
            label="HEIGHT"
            value={heightText}
            onChangeText={(t) => {
              setHeightText(t);
              setMetricsError(null);
            }}
            placeholder={units === 'imperial' ? "5' 10\"" : '178'}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Input
            label={`WEIGHT (${units === 'imperial' ? 'LB' : 'KG'})`}
            value={weightText}
            onChangeText={(t) => {
              setWeightText(t);
              setMetricsError(null);
            }}
            keyboardType="numeric"
            placeholder={units === 'imperial' ? '165' : '75'}
          />
        </View>
      </View>

      <Input
        label="AGE"
        value={ageText}
        onChangeText={(t) => {
          setAgeText(t);
          setMetricsError(null);
        }}
        keyboardType="numeric"
        placeholder="19"
        containerStyle={{ marginBottom: 4 }}
      />

      {metricsError ? <Text style={styles.errorText}>{metricsError}</Text> : null}

      <Button
        label="Save body metrics"
        variant="secondary"
        onPress={handleSaveMetrics}
        loading={savingMetrics}
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
  rowInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowGrid: {
    flexDirection: 'row',
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
