import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Input, OptionCard, IconButton, ProgressBar, Icon } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { calculateGoals } from '@/lib/goals';

export default function OnboardingAboutScreen() {
  const router = useRouter();
  const goal = useAuthStore((state) => state.goal);
  const setGoal = useAuthStore((state) => state.setGoal);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const [saving, setSaving] = useState(false);

  const [heightText, setHeightText] = useState('5ft 10in');
  const [weightText, setWeightText] = useState('168');
  const [ageText, setAgeText] = useState('19');
  const [classYearText, setClassYearText] = useState('2029');
  const [activity, setActivity] = useState<'sedentary' | 'moderate' | 'active'>('moderate');

  const parseHeightToCm = (str: string): number | null => {
    const trimmed = str.trim().toLowerCase();
    if (!trimmed) return null;

    // Check for ft/in pattern (e.g. 5ft 10in, 5'10, 5 10)
    const match = trimmed.match(/(\d+)\s*(?:ft|'|foot)?\s*(\d+)?\s*(?:in|"|inches)?/);
    if (match && match[1]) {
      const feet = parseInt(match[1], 10);
      const inches = match[2] ? parseInt(match[2], 10) : 0;
      return Math.round((feet * 12 + inches) * 2.54);
    }

    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  };

  const parseWeightToKg = (str: string): number | null => {
    const num = parseFloat(str.trim());
    if (isNaN(num) || num <= 0) return null;
    return Math.round(num * 0.45359237 * 10) / 10;
  };

  const handleContinue = async () => {
    const goalType = goal?.goal_type || 'lose';

    const height_cm = parseHeightToCm(heightText);
    const weight_kg = parseWeightToKg(weightText);
    const age = parseInt(ageText.trim(), 10) || null;
    const class_year = parseInt(classYearText.trim(), 10) || null;

    setSaving(true);
    try {
      await updateProfile({
        height_cm,
        weight_kg,
        age,
        class_year,
        activity_level: activity,
      });
    } catch (err) {
      // Onboarding should not dead-end on a failed write; the profile screen can
      // save these again later.
      console.warn('Could not save profile details:', err);
    } finally {
      setSaving(false);
    }

    if (goalType === 'tracking') {
      setGoal({
        goal_type: 'tracking',
        calorie_target: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      });
      router.push('/(onboarding)/targets' as any);
      return;
    }

    // Compute goals with Mifflin-St Jeor & §11 clamps
    const calculated = calculateGoals({
      goal_type: goalType,
      height_cm,
      weight_kg,
      age,
      activity_level: activity,
    });

    setGoal({
      goal_type: goalType,
      calorie_target: calculated.calorie_target,
      protein_g: calculated.protein_g,
      carbs_g: calculated.carbs_g,
      fat_g: calculated.fat_g,
    });

    router.push('/(onboarding)/targets' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Top Progress Bar */}
          <View style={styles.topHeader}>
            <IconButton
              icon={<Icon name="back" size="md" color={Colors.inkSoft} />}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
            <View style={styles.progressWrapper}>
              <ProgressBar progress={2 / 3} height={6} />
            </View>
            <Text style={Typography.monoUnit}>2/3</Text>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={Typography.displayL}>A little about you</Text>
            <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8, marginBottom: 24 }]}>
              Only used to calculate your numbers.
            </Text>

            {/* Form Fields */}
            <View style={styles.rowGrid}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Input
                  label="HEIGHT"
                  value={heightText}
                  onChangeText={setHeightText}
                  placeholder="5ft 10in"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Input
                  label="WEIGHT (LB)"
                  value={weightText}
                  onChangeText={setWeightText}
                  keyboardType="numeric"
                  placeholder="168"
                />
              </View>
            </View>

            <View style={styles.rowGrid}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Input
                  label="AGE"
                  value={ageText}
                  onChangeText={setAgeText}
                  keyboardType="numeric"
                  placeholder="19"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Input
                  label="CLASS YEAR"
                  value={classYearText}
                  onChangeText={setClassYearText}
                  keyboardType="numeric"
                  placeholder="2029"
                />
              </View>
            </View>

            {/* Activity Level Selection */}
            <Text style={[Typography.monoLabel, { marginTop: 12, marginBottom: 12 }]}>
              HOW ACTIVE IS YOUR WEEK?
            </Text>

            <OptionCard
              icon="activityLow"
              title="Mostly classes & library"
              subtitle="Sedentary, studying mostly"
              selected={activity === 'sedentary'}
              onPress={() => setActivity('sedentary')}
            />

            <OptionCard
              icon="activityMedium"
              title="Walking campus, gym 2–3×"
              subtitle="Moderate daily movement"
              selected={activity === 'moderate'}
              onPress={() => setActivity('moderate')}
            />

            <OptionCard
              icon="activityHigh"
              title="Training most days"
              subtitle="Athletics or heavy workouts"
              selected={activity === 'active'}
              onPress={() => setActivity('active')}
            />
          </ScrollView>

          <View style={styles.bottomBar}>
            <Button
              label="See your plan"
              variant="primary"
              onPress={handleContinue}
              loading={saving}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressWrapper: {
    flex: 1,
    marginHorizontal: 16,
  },
  content: {
    paddingBottom: 24,
  },
  rowGrid: {
    flexDirection: 'row',
  },
  bottomBar: {
    width: '100%',
    paddingTop: 12,
  },
});
