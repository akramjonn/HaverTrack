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
import { Colors, Fonts, MacroColors, Typography, Radii } from '@/constants/theme';
import { Button, Card, IconButton, Icon } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export default function OnboardingTargetsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const goal = useAuthStore((state) => state.goal);
  const saveGoal = useAuthStore((state) => state.saveGoal);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);
  const [saving, setSaving] = useState(false);

  const isTracking = goal?.goal_type === 'tracking';
  const targetCalories = goal?.calorie_target ?? 2340;
  const targetProtein = goal?.protein_g ?? 140;
  const targetCarbs = goal?.carbs_g ?? 265;
  const targetFat = goal?.fat_g ?? 72;

  const handleStart = async () => {
    setSaving(true);
    try {
      await saveGoal({
        goal_type: goal?.goal_type || 'lose',
        calorie_target: isTracking ? null : targetCalories,
        protein_g: isTracking ? null : targetProtein,
        carbs_g: isTracking ? null : targetCarbs,
        fat_g: isTracking ? null : targetFat,
      });
      await completeOnboarding();
    } catch (err) {
      console.warn('Goal persist warning:', err);
    } finally {
      setSaving(false);
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.topHeader}>
          <IconButton
            icon={<Icon name="back" size="md" color={Colors.inkSoft} />}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.eyebrowRow}>
            <Icon name="success" size="xs" color={Colors.scarlet} />
            <Text style={[Typography.monoLabel, { color: Colors.scarlet }]}>PLAN READY</Text>
          </View>

          {isTracking ? (
            <>
              <Text style={[Typography.displayXL, { marginTop: 8 }]}>Log and observe</Text>
              <Text style={[Typography.bodyL, { color: Colors.textMuted, marginTop: 12, marginBottom: 28 }]}>
                You're in tracking mode. You won't see calorie limits or deficit targets — just clear nutritional breakdowns of what the DC serves you.
              </Text>
            </>
          ) : (
            <>
              <Text style={[Typography.displayXL, { marginTop: 8 }]}>
                {targetCalories.toLocaleString()} calories a day
              </Text>
              <Text style={[Typography.bodyL, { color: Colors.textMuted, marginTop: 12, marginBottom: 28 }]}>
                Roughly a DC breakfast, a full lunch plate, and dinner with dessert.
              </Text>

              {/*
                This card is the app's first sight of the macro marks, on the
                one screen with room to show each glyph beside its full name and
                a sentence of rationale. Everywhere afterwards — the Today hero,
                the menu rows, the progress split — the same three marks appear
                without their names, and this is what makes that readable.
              */}
              <Card style={styles.macroCard}>
                <View style={styles.macroRow}>
                  <View style={[styles.macroGlyph, { backgroundColor: 'rgba(158, 27, 50, 0.10)' }]}>
                    <Icon name="protein" size="md" color={MacroColors.protein} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={Typography.title}>Protein</Text>
                    <Text style={styles.rationale}>Keeps you full through 4pm labs</Text>
                  </View>
                  <Text style={styles.macroGrams}>{targetProtein}g</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.macroRow}>
                  <View style={[styles.macroGlyph, { backgroundColor: 'rgba(217, 119, 6, 0.10)' }]}>
                    <Icon name="carbs" size="md" color={MacroColors.carbs} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={Typography.title}>Carbs</Text>
                    <Text style={styles.rationale}>Fuel for walking between classes</Text>
                  </View>
                  <Text style={styles.macroGrams}>{targetCarbs}g</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.macroRow}>
                  <View style={[styles.macroGlyph, { backgroundColor: 'rgba(21, 128, 61, 0.10)' }]}>
                    <Icon name="fat" size="md" color={MacroColors.fat} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={Typography.title}>Fat</Text>
                    <Text style={styles.rationale}>No need to avoid the good stuff</Text>
                  </View>
                  <Text style={styles.macroGrams}>{targetFat}g</Text>
                </View>
              </Card>
            </>
          )}

          {/* Reassurance Footer Card */}
          <Card style={styles.infoCard}>
            <Icon name="info" size="md" color={Colors.textFaint} style={{ marginTop: 1 }} />
            <Text style={styles.infoText}>
              You can change these anytime — targets adjust weekly based on what you actually log.
            </Text>
          </Card>
        </ScrollView>

        <View style={styles.bottomBar}>
          <Button
            label="Start logging"
            variant="primary"
            onPress={handleStart}
            loading={saving}
            style={{ marginBottom: 12 }}
          />

          {!isTracking ? (
            <Button
              label="Adjust targets"
              variant="secondary"
              onPress={() => router.push('/(onboarding)/goal' as any)}
            />
          ) : null}
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
    marginBottom: 16,
  },
  content: {
    paddingBottom: 24,
  },
  macroCard: {
    padding: 0,
    marginBottom: 20,
    overflow: 'hidden',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 20,
  },
  macroGlyph: {
    width: 36,
    height: 36,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rationale: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  macroGrams: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 20,
    color: Colors.ink,
  },
  divider: {
    // Inset past the glyph well so the rule starts where the macro names do.
    height: 1,
    backgroundColor: Colors.borderSoft,
    marginLeft: 70,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.surfaceWarm,
    borderColor: Colors.borderSoft,
    padding: 16,
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textMuted,
  },
  bottomBar: {
    width: '100%',
  },
});
