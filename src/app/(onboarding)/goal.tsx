import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, OptionCard, IconButton, ProgressBar } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';

export default function OnboardingGoalScreen() {
  const router = useRouter();
  const goal = useAuthStore((state) => state.goal);
  const setGoal = useAuthStore((state) => state.setGoal);

  const [selectedGoal, setSelectedGoal] = useState<'lose' | 'maintain' | 'gain' | 'tracking'>(
    goal?.goal_type || 'lose'
  );

  const handleContinue = () => {
    if (selectedGoal === 'tracking') {
      setGoal({
        goal_type: 'tracking',
        calorie_target: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
      });
      router.push('/(onboarding)/about' as any);
    } else {
      setGoal({
        ...goal,
        goal_type: selectedGoal,
        calorie_target: goal?.calorie_target ?? 2340,
        protein_g: goal?.protein_g ?? 140,
        carbs_g: goal?.carbs_g ?? 265,
        fat_g: goal?.fat_g ?? 72,
      });
      router.push('/(onboarding)/about' as any);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        {/* Progress Header */}
        <View style={styles.topHeader}>
          <IconButton
            icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
          <View style={styles.progressWrapper}>
            <ProgressBar progress={1 / 3} height={6} />
          </View>
          <Text style={Typography.monoUnit}>1/3</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={Typography.displayL}>What are you here for?</Text>
          <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8, marginBottom: 28 }]}>
            We'll set your daily targets from this.
          </Text>

          <OptionCard
            title="Lose weight"
            subtitle="Gentle deficit, 0.5 lb per week"
            selected={selectedGoal === 'lose'}
            onPress={() => setSelectedGoal('lose')}
          />

          <OptionCard
            title="Maintain"
            subtitle="Eat around your current level"
            selected={selectedGoal === 'maintain'}
            onPress={() => setSelectedGoal('maintain')}
          />

          <OptionCard
            title="Gain weight"
            subtitle="Small surplus with protein focus"
            selected={selectedGoal === 'gain'}
            onPress={() => setSelectedGoal('gain')}
          />

          <OptionCard
            title="Just tracking"
            subtitle="No target, log and observe"
            selected={selectedGoal === 'tracking'}
            onPress={() => setSelectedGoal('tracking')}
          />
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            label="Continue"
            variant="primary"
            onPress={handleContinue}
          />
        </View>
      </View>
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
    marginBottom: 24,
  },
  progressWrapper: {
    flex: 1,
    marginHorizontal: 16,
  },
  content: {
    paddingBottom: 20,
  },
  bottomBar: {
    width: '100%',
    paddingTop: 12,
  },
});
