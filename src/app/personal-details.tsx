import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Card, Button, Input, SegmentedControl, IconButton } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';
import { useAuthStore, type UserProfile, type EditableProfile } from '@/store/authStore';
import {
  formatHeight,
  formatWeight,
  parseHeightInput,
  parseWeightToKg,
  kgToLb,
  type Units,
} from '@/lib/units';
import { fetchPreferences, savePreferences, type UserPreferences } from '@/lib/water';

/**
 * Plain pushed route (same convention as `edit-goals.tsx`/`bmi-info.tsx` —
 * no `_layout.tsx` entry needed). Absorbs the "BODY METRICS" section that
 * used to live inline on the Settings tab, and adds Goal Weight and Gender
 * alongside it.
 */
export default function PersonalDetailsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const units: Units = profile?.units ?? 'imperial';
  const [savingUnits, setSavingUnits] = useState(false);

  // Goal weight lives in `user_preferences`, not the profile store, so it
  // needs its own one-off fetch — same pattern as `(tabs)/progress.tsx`'s
  // goal-weight lookup.
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetchPreferences(user.id)
      .then((data) => setPrefs(data))
      .catch((e) => console.warn('Could not load preferences:', e));
  }, [user?.id]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={[Typography.title, { marginLeft: 12 }]}>Personal Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>UNITS</Text>
          <SegmentedControl
            options={[
              { value: 'imperial', label: 'Imperial' },
              { value: 'metric', label: 'Metric' },
            ]}
            value={units}
            onChange={handleUnitsChange}
            style={{ opacity: savingUnits ? 0.6 : 1 }}
          />
        </View>

        <GoalWeightCard
          userId={user?.id ?? null}
          units={units}
          goalWeightKg={prefs?.goal_weight_kg ?? null}
          onSaved={(kg) => setPrefs((p) => (p ? { ...p, goal_weight_kg: kg } : p))}
        />

        {/* Keyed by profile id + units: the fields below are only ever an
            *initial* render of external state, so a remount on either
            changing is the correct reset — not an effect that calls
            setState after the fact. */}
        <PersonalDetailsForm
          key={`${profile?.id ?? 'anon'}-${units}`}
          profile={profile}
          units={units}
          updateProfile={updateProfile}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface GoalWeightCardProps {
  userId: string | null;
  units: Units;
  goalWeightKg: number | null;
  onSaved: (kg: number | null) => void;
}

/**
 * Display + "Change Goal" tap-to-edit affordance for `goal_weight_kg`.
 * Collapses back to the read-only display on successful save; the draft
 * input is (re-)seeded fresh every time editing starts, so no stale text
 * survives a cancel.
 */
function GoalWeightCard({ userId, units, goalWeightKg, onSaved }: GoalWeightCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    if (goalWeightKg) {
      const displayValue = units === 'imperial' ? kgToLb(goalWeightKg) : goalWeightKg;
      setDraftText(displayValue.toFixed(1));
    } else {
      setDraftText('');
    }
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    setError(null);

    const kg = draftText.trim() ? parseWeightToKg(draftText, units) : null;
    if (draftText.trim() && kg === null) {
      setError('Could not read that weight.');
      return;
    }

    setSaving(true);
    try {
      await savePreferences(userId, { goal_weight_kg: kg });
      onSaved(kg);
      setEditing(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your goal weight.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>GOAL WEIGHT</Text>
      <Card style={styles.card}>
        {editing ? (
          <>
            <Input
              label={`GOAL WEIGHT (${units === 'imperial' ? 'LB' : 'KG'})`}
              value={draftText}
              onChangeText={(t) => {
                setDraftText(t);
                setError(null);
              }}
              keyboardType="numeric"
              placeholder={units === 'imperial' ? '150' : '68'}
              containerStyle={{ marginBottom: 4 }}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.rowGrid}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setEditing(false)}
                style={{ flex: 1, marginRight: 8 }}
              />
              <Button
                label="Save"
                variant="primary"
                onPress={handleSave}
                loading={saving}
                style={{ flex: 1, marginLeft: 8 }}
              />
            </View>
          </>
        ) : (
          <View style={styles.rowBetween}>
            <View>
              <Text style={Typography.monoLabel}>CURRENT TARGET</Text>
              <Text style={[Typography.title, { marginTop: 4 }]}>
                {formatWeight(goalWeightKg, units)}
              </Text>
            </View>
            <Button
              label="Change Goal"
              variant="secondary"
              onPress={startEditing}
              style={{ height: 38, paddingHorizontal: 16 }}
            />
          </View>
        )}
      </Card>
    </View>
  );
}

interface PersonalDetailsFormProps {
  profile: UserProfile | null;
  units: Units;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
}

/**
 * Height/weight/age/gender editor. Mounted with a key from the parent so
 * its local text state is *initialized* fresh from `profile` whenever
 * identity or units change, rather than an effect re-syncing it after the
 * fact — the exact idiom `BodyMetricsFields` used on the Settings tab
 * before this section moved here.
 */
function PersonalDetailsForm({ profile, units, updateProfile }: PersonalDetailsFormProps) {
  const [heightText, setHeightText] = useState(
    profile?.height_cm ? formatHeight(profile.height_cm, units) : ''
  );
  const [weightText, setWeightText] = useState(
    profile?.weight_kg ? formatWeight(profile.weight_kg, units) : ''
  );
  const [ageText, setAgeText] = useState(profile?.age != null ? String(profile.age) : '');
  const [sex, setSex] = useState<'male' | 'female' | 'unspecified'>(profile?.sex ?? 'unspecified');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearError = () => setFormError(null);

  const handleSave = async () => {
    setFormError(null);

    const height_cm = heightText.trim() ? parseHeightInput(heightText, units) : null;
    if (heightText.trim() && height_cm === null) {
      setFormError('Could not read that height.');
      return;
    }

    const weight_kg = weightText.trim() ? parseWeightToKg(weightText, units) : null;
    if (weightText.trim() && weight_kg === null) {
      setFormError('Could not read that weight.');
      return;
    }

    let age: number | null = null;
    if (ageText.trim()) {
      const parsedAge = parseInt(ageText.trim(), 10);
      if (isNaN(parsedAge) || parsedAge <= 0) {
        setFormError('Age must be a number.');
        return;
      }
      age = parsedAge;
    }

    setSaving(true);
    try {
      await updateProfile({ height_cm, weight_kg, age, sex });
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>BODY METRICS</Text>
      <Card style={styles.card}>
        <View style={styles.rowGrid}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Input
              label="HEIGHT"
              value={heightText}
              onChangeText={(t) => {
                setHeightText(t);
                clearError();
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
                clearError();
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
            clearError();
          }}
          keyboardType="numeric"
          placeholder="19"
        />

        <Text style={styles.fieldLabel}>GENDER</Text>
        <SegmentedControl
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'unspecified', label: 'Prefer not to say' },
          ]}
          value={sex}
          onChange={(v) => {
            setSex(v);
            clearError();
          }}
          style={{ marginBottom: 16 }}
        />

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <Button
          label="Save personal details"
          variant="secondary"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: 8 }}
        />
      </Card>
    </View>
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
    paddingTop: 8,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  card: {
    marginBottom: 0,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowGrid: {
    flexDirection: 'row',
  },
  fieldLabel: {
    ...Typography.monoLabel,
    marginBottom: 7,
  },
  errorText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginBottom: 8,
  },
});
