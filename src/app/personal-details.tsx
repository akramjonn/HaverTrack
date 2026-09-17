import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Card, Button, Input, SegmentedControl, IconButton } from '@/components/ui';
import { ArrowLeft, ChevronRight, Ruler } from 'lucide-react-native';
import { useAuthStore, type UserProfile, type EditableProfile } from '@/store/authStore';
import {
  formatHeight,
  formatWeight,
  parseHeightInput,
  parseWeightToKg,
  kgToLb,
} from '@/lib/units';
import { usePreferences, useSavePreferences, type HeightUnit, type WeightUnit } from '@/lib/preferences';

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

  const legacyUnits = profile?.units ?? 'imperial';
  const preferences = usePreferences(user?.id, legacyUnits);
  const savePreferences = useSavePreferences(user?.id, legacyUnits);
  const weightUnit = preferences.data?.weight_unit ?? (legacyUnits === 'metric' ? 'kg' : 'lb');
  const heightUnit = preferences.data?.height_unit ?? (legacyUnits === 'metric' ? 'cm' : 'ft_in');

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
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => router.push('/units' as never)}
              accessibilityRole="button"
              accessibilityLabel="Open units settings"
              style={styles.unitsRow}
            >
              <Ruler size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Units</Text>
                <Text style={Typography.caption}>
                  {weightUnit === 'lb' ? 'Pounds' : 'Kilograms'} · {heightUnit === 'ft_in' ? 'Feet and inches' : 'Centimeters'}
                </Text>
              </View>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>

        <GoalWeightCard
          userId={user?.id ?? null}
          weightUnit={weightUnit}
          goalWeightKg={preferences.data?.goal_weight_kg ?? null}
          onSaved={(goal_weight_kg) => savePreferences.mutateAsync({ goal_weight_kg })}
        />

        {/* Keyed by profile id + units: the fields below are only ever an
            *initial* render of external state, so a remount on either
            changing is the correct reset — not an effect that calls
            setState after the fact. */}
        <PersonalDetailsForm
          key={`${profile?.id ?? 'anon'}-${weightUnit}-${heightUnit}`}
          profile={profile}
          weightUnit={weightUnit}
          heightUnit={heightUnit}
          updateProfile={updateProfile}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface GoalWeightCardProps {
  userId: string | null;
  weightUnit: WeightUnit;
  goalWeightKg: number | null;
  onSaved: (kg: number | null) => Promise<unknown>;
}

/**
 * Display + "Change Goal" tap-to-edit affordance for `goal_weight_kg`.
 * Collapses back to the read-only display on successful save; the draft
 * input is (re-)seeded fresh every time editing starts, so no stale text
 * survives a cancel.
 */
function GoalWeightCard({ userId, weightUnit, goalWeightKg, onSaved }: GoalWeightCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    if (goalWeightKg) {
      const displayValue = weightUnit === 'lb' ? kgToLb(goalWeightKg) : goalWeightKg;
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

    const kg = draftText.trim() ? parseWeightToKg(draftText, weightUnit) : null;
    if (draftText.trim() && kg === null) {
      setError('Could not read that weight.');
      return;
    }

    setSaving(true);
    try {
      await onSaved(kg);
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
              label={`GOAL WEIGHT (${weightUnit.toUpperCase()})`}
              value={draftText}
              onChangeText={(t) => {
                setDraftText(t);
                setError(null);
              }}
              keyboardType="numeric"
              placeholder={weightUnit === 'lb' ? '150' : '68'}
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
                {formatWeight(goalWeightKg, weightUnit)}
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
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
}

/**
 * Height/weight/age/gender editor. Mounted with a key from the parent so
 * its local text state is *initialized* fresh from `profile` whenever
 * identity or units change, rather than an effect re-syncing it after the
 * fact — the exact idiom `BodyMetricsFields` used on the Settings tab
 * before this section moved here.
 */
function PersonalDetailsForm({ profile, weightUnit, heightUnit, updateProfile }: PersonalDetailsFormProps) {
  const [heightText, setHeightText] = useState(
    profile?.height_cm ? formatHeight(profile.height_cm, heightUnit) : ''
  );
  const [weightText, setWeightText] = useState(
    profile?.weight_kg ? formatWeight(profile.weight_kg, weightUnit) : ''
  );
  const [ageText, setAgeText] = useState(profile?.age != null ? String(profile.age) : '');
  const [sex, setSex] = useState<'male' | 'female' | 'unspecified'>(profile?.sex ?? 'unspecified');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearError = () => setFormError(null);

  const handleSave = async () => {
    setFormError(null);

    const height_cm = heightText.trim() ? parseHeightInput(heightText, heightUnit) : null;
    if (heightText.trim() && height_cm === null) {
      setFormError('Could not read that height.');
      return;
    }

    const weight_kg = weightText.trim() ? parseWeightToKg(weightText, weightUnit) : null;
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
              placeholder={heightUnit === 'ft_in' ? "5' 10\"" : '178'}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Input
              label={`WEIGHT (${weightUnit.toUpperCase()})`}
              value={weightText}
              onChangeText={(t) => {
                setWeightText(t);
                clearError();
              }}
              keyboardType="numeric"
              placeholder={weightUnit === 'lb' ? '165' : '75'}
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
  unitsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
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
