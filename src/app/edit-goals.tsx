import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography } from '@/constants/theme';
import { Card, Button, Input, IconButton } from '@/components/ui';
import { ArrowLeft, Flame, Beef, Wheat, Droplet, Sparkles } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { calculateGoals, MIN_CALORIE_FLOOR } from '@/lib/goals';

/**
 * Standalone, self-service editor for the current day's nutrition targets.
 * Seeded once from the store on mount (no effect-based re-sync — matches the
 * `BodyMetricsFields`/`NameField` idiom in `(tabs)/settings.tsx`).
 */
export default function EditGoalsScreen() {
  const router = useRouter();
  const goal = useAuthStore((s) => s.goal);
  const profile = useAuthStore((s) => s.profile);
  const saveGoal = useAuthStore((s) => s.saveGoal);

  const isTracking = goal?.goal_type === 'tracking';

  const [calorieText, setCalorieText] = useState(
    goal?.calorie_target != null ? String(goal.calorie_target) : ''
  );
  const [proteinText, setProteinText] = useState(
    goal?.protein_g != null ? String(goal.protein_g) : ''
  );
  const [carbsText, setCarbsText] = useState(goal?.carbs_g != null ? String(goal.carbs_g) : '');
  const [fatText, setFatText] = useState(goal?.fat_g != null ? String(goal.fat_g) : '');

  const [formError, setFormError] = useState<string | null>(null);
  const [floorWarning, setFloorWarning] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const clearMessages = () => {
    setFormError(null);
  };

  const handleAutoGenerate = () => {
    setGenerating(true);
    try {
      const calculated = calculateGoals({
        goal_type: goal?.goal_type ?? 'maintain',
        height_cm: profile?.height_cm,
        weight_kg: profile?.weight_kg,
        age: profile?.age,
        sex: profile?.sex ?? undefined,
        activity_level: profile?.activity_level ?? undefined,
      });

      setCalorieText(calculated.calorie_target != null ? String(calculated.calorie_target) : '');
      setProteinText(calculated.protein_g != null ? String(calculated.protein_g) : '');
      setCarbsText(calculated.carbs_g != null ? String(calculated.carbs_g) : '');
      setFatText(calculated.fat_g != null ? String(calculated.fat_g) : '');
      setFormError(null);
      setFloorWarning(null);
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Parses a field to a non-negative integer. Empty input is only valid in
   * tracking mode (mirrors `DailyGoal`'s `null` fields there); everywhere
   * else it's a required field.
   */
  const parseField = (text: string): number | null | 'invalid' => {
    const trimmed = text.trim();
    if (!trimmed) {
      return isTracking ? null : 'invalid';
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 'invalid';
    }
    return Math.round(parsed);
  };

  const handleSave = async () => {
    setFormError(null);
    setFloorWarning(null);

    const calorie_target = parseField(calorieText);
    const protein_g = parseField(proteinText);
    const carbs_g = parseField(carbsText);
    const fat_g = parseField(fatText);

    if (
      calorie_target === 'invalid' ||
      protein_g === 'invalid' ||
      carbs_g === 'invalid' ||
      fat_g === 'invalid'
    ) {
      setFormError('Enter a valid non-negative number in every field.');
      return;
    }

    // §11 wellbeing floor: a visible caution, not a hard block — this is an
    // adult self-service edit, not the onboarding wizard, so the user can
    // knowingly override it.
    if (!isTracking && calorie_target != null && calorie_target < MIN_CALORIE_FLOOR) {
      setFloorWarning(
        `${calorie_target} kcal is below the recommended ${MIN_CALORIE_FLOOR} kcal/day floor. Saved anyway, but consider raising it.`
      );
    }

    setSaving(true);
    try {
      await saveGoal({
        goal_type: goal?.goal_type ?? 'maintain',
        calorie_target,
        protein_g,
        carbs_g,
        fat_g,
      });
      router.back();
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not save your goals. Please try again.');
    } finally {
      setSaving(false);
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
        <Text style={[Typography.title, { marginLeft: 12 }]}>Edit nutrition goals</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[Typography.body, { color: Colors.textMuted, marginBottom: 20 }]}>
          Adjust your daily targets directly, or auto-generate them from your profile and
          fine-tune from there.
        </Text>

        <Card style={styles.card}>
          <FieldRow
            icon={<Flame size={18} color={Colors.scarlet} />}
            label="CALORIE TARGET"
            unit="KCAL"
            value={calorieText}
            onChangeText={(t) => {
              setCalorieText(t);
              clearMessages();
            }}
            placeholder="2340"
          />
          <FieldRow
            icon={<Beef size={18} color={Colors.scarlet} />}
            label="PROTEIN"
            unit="G"
            value={proteinText}
            onChangeText={(t) => {
              setProteinText(t);
              clearMessages();
            }}
            placeholder="140"
          />
          <FieldRow
            icon={<Wheat size={18} color={Colors.gold} />}
            label="CARBS"
            unit="G"
            value={carbsText}
            onChangeText={(t) => {
              setCarbsText(t);
              clearMessages();
            }}
            placeholder="265"
          />
          <FieldRow
            icon={<Droplet size={18} color={Colors.green} />}
            label="FAT"
            unit="G"
            value={fatText}
            onChangeText={(t) => {
              setFatText(t);
              clearMessages();
            }}
            placeholder="72"
            last
          />

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          {floorWarning ? <Text style={styles.warningText}>{floorWarning}</Text> : null}
        </Card>

        <Button
          label="Auto Generate Goals"
          variant="secondary"
          icon={<Sparkles size={16} color={Colors.ink} />}
          onPress={handleAutoGenerate}
          loading={generating}
          style={{ marginBottom: 12 }}
        />

        <Text style={[Typography.caption, { color: Colors.textFaint, marginBottom: 24 }]}>
          Auto Generate fills in the fields above from your height, weight, age, and activity
          level — review and adjust before saving.
        </Text>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Button label="Save" variant="primary" onPress={handleSave} loading={saving} />
      </View>
    </SafeAreaView>
  );
}

interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  last?: boolean;
}

function FieldRow({ icon, label, unit, value, onChangeText, placeholder, last }: FieldRowProps) {
  return (
    <View style={[styles.fieldRow, last ? { marginBottom: 4 } : null]}>
      <View style={styles.fieldIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Input
          label={`${label} (${unit})`}
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder={placeholder}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>
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
    paddingBottom: 24,
  },
  card: {
    marginBottom: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  fieldIcon: {
    width: 32,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  errorText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginTop: 4,
  },
  warningText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.amber,
    marginTop: 4,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    backgroundColor: Colors.cream,
  },
});
