import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Button, Input, SegmentedControl } from '@/components/ui';
import {
  User,
  Heart,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  LogOut,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Ruler,
} from 'lucide-react-native';
import { useAuthStore, selectIsAdmin, type UserProfile, type EditableProfile } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { supabase } from '@/lib/supabase';
import { formatHeight, formatWeight, parseHeightInput, parseWeightToKg, type Units } from '@/lib/units';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const signOut = useAuthStore((state) => state.signOut);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const isAdmin = useAuthStore(selectIsAdmin);
  const [deleting, setDeleting] = useState(false);
  const logs = useLogStore((state) => state.logs);
  const weightEntries = useLogStore((state) => state.weightEntries);

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

  const handleExportData = async () => {
    try {
      const exportData = JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          user: user,
          goal: goal,
          weight_entries: weightEntries,
          meal_logs: logs,
        },
        null,
        2
      );

      await Share.share({
        title: 'SquirrelTrack Data Export',
        message: exportData,
      });
    } catch (e) {
      Alert.alert('Export Failed', 'Could not generate JSON export.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & All Data',
      'This will permanently delete your profile, meal logs, photo scans, and weight history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.functions.invoke('delete-account', {
                method: 'POST',
              });
              if (error) throw error;

              await signOut();
              router.replace('/(auth)/welcome' as any);
            } catch (err: any) {
              Alert.alert(
                'Could not delete account',
                err?.message ||
                  'Your account was not deleted. Check your connection and try again, or email us to remove it manually.'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>You</Text>
          <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 4 }]}>
            {profile?.email || user?.email || ''}
          </Text>
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
              onPress={() => router.push('/(onboarding)/goal' as any)}
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

        {/* Campus Wellbeing Resources Section (§11 & §13) */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CAMPUS & HEALTH RESOURCES</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => Linking.openURL('https://www.haverford.edu/caps')}
              style={styles.menuRow}
            >
              <Heart size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Haverford CAPS</Text>
                <Text style={Typography.caption}>Counseling & Psychological Services</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() =>
                Linking.openURL('https://www.haverford.edu/dining-services/nutrition-and-dietary-support')
              }
              style={styles.menuRow}
            >
              <Sparkles size={18} color={Colors.gold} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Bi-Co Campus Dietitian</Text>
                <Text style={Typography.caption}>Dining Services Nutrition Support</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL('https://www.allianceforeatingdisorders.com/')}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <Heart size={18} color={Colors.textMuted} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>National Eating Disorders Helpline</Text>
                <Text style={Typography.caption}>Free, confidential support & resources</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>

        {/* Legal & Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>DATA & LEGAL</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={handleExportData}
              style={styles.menuRow}
            >
              <Download size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Download All Data (JSON)</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/privacy' as any)}
              style={styles.menuRow}
            >
              <FileText size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Privacy Policy</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/terms' as any)}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <FileText size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Terms of Service</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={handleSignOut}
            style={{ marginBottom: 12 }}
          />

          <Button
            label="Delete Account & All Data"
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={deleting}
          />
        </View>

        {/* Institutional Disclaimer */}
        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            SquirrelTrack is an independent student project.{'\n'}
            Not affiliated with or endorsed by Haverford College Dining Services.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  header: {
    marginBottom: 20,
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
    marginBottom: 24,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
