import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Colors,
  Fonts,
  Typography,
  Radii,
} from '@/constants/theme';
import {
  AppIcon,
  Button,
  Input,
  Card,
  HeroCard,
  OptionCard,
  IconButton,
  ProgressBar,
  CalorieRing,
  SegmentedControl,
  Chip,
  Stepper,
  StreakBadge,
} from '@/components/ui';
import { ArrowLeft, Sparkles, ChevronRight, Apple } from 'lucide-react-native';

export default function ComponentGalleryScreen() {
  const router = useRouter();
  const [selectedGoal, setSelectedGoal] = useState<'lose' | 'maintain' | 'gain' | 'tracking'>('lose');
  const [mealSegment, setMealSegment] = useState<'lunch' | 'dinner' | 'coop'>('lunch');
  const [portion, setPortion] = useState(1);
  const [inputVal, setInputVal] = useState('jsmith@haverford.edu');
  const [passwordVal, setPasswordVal] = useState('SquirrelTrack#1');
  const [ringCalories, setRingCalories] = useState(1180);
  const targetCalories = 2340;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <AppIcon size={44} />
            <View style={{ marginLeft: 12 }}>
              <Text style={Typography.monoLabel}>SQUIRRELTRACK DESIGN SYSTEM</Text>
              <Text style={Typography.displayM}>Component Gallery</Text>
            </View>
          </View>
          <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 8 }]}>
            Phase 1 verified token specifications, atomic primitives, and UI elements.
          </Text>

          {/* Quick links to screens */}
          <View style={styles.quickLinks}>
            <Button
              label="Go to 01 Welcome Screen"
              onPress={() => router.push('/(auth)/welcome' as any)}
              style={{ marginBottom: 8 }}
            />
            <Button
              label="Go to 02 Sign-up Screen"
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-up' as any)}
            />
          </View>
        </View>

        {/* 1. BRAND & APP ICON */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>01 · ICON & MARKS</Text>
          <Text style={styles.sectionTitle}>App Icon (Mark 2b — Tail S)</Text>
          <View style={styles.iconRow}>
            <View style={styles.iconItem}>
              <AppIcon size={88} variant="light" />
              <Text style={[Typography.caption, { marginTop: 8 }]}>Light Stroke (88px)</Text>
            </View>
            <View style={[styles.iconItem, { backgroundColor: Colors.darkBg, padding: 12, borderRadius: 18 }]}>
              <AppIcon size={88} variant="dark" />
              <Text style={[Typography.caption, { color: Colors.cream, marginTop: 8 }]}>Dark Context (88px)</Text>
            </View>
            <View style={styles.iconItem}>
              <AppIcon size={44} variant="light" />
              <Text style={[Typography.caption, { marginTop: 8 }]}>In-App (44px)</Text>
            </View>
          </View>
        </View>

        {/* 2. COLOR PALETTE */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>02 · PALETTE TOKENS</Text>
          <Text style={styles.sectionTitle}>Exact Design Palette</Text>

          <Text style={[Typography.monoLabel, { marginTop: 12, marginBottom: 6 }]}>BRAND & ACCENTS</Text>
          <View style={styles.swatchGrid}>
            <Swatch color={Colors.scarlet} name="--scarlet" hex="#9E1B32" textColor="#FFF" />
            <Swatch color={Colors.scarletBright} name="--scarlet-bright" hex="#E23A50" textColor="#FFF" />
            <Swatch color={Colors.gold} name="--gold" hex="#E8B84B" textColor="#000" />
          </View>

          <Text style={[Typography.monoLabel, { marginTop: 16, marginBottom: 6 }]}>LIGHT SURFACES & INK</Text>
          <View style={styles.swatchGrid}>
            <Swatch color={Colors.cream} name="--cream (bg)" hex="#FBF8F3" border />
            <Swatch color={Colors.surface} name="--surface" hex="#FFFFFF" border />
            <Swatch color={Colors.surfaceWarm} name="--surface-warm" hex="#F3ECE0" />
            <Swatch color={Colors.track} name="--track" hex="#F0E8DC" />
            <Swatch color={Colors.border} name="--border" hex="#E1D9CD" />
            <Swatch color={Colors.ink} name="--ink" hex="#141414" textColor="#FFF" />
          </View>
        </View>

        {/* 3. CALORIE RING & HERO CARD */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>03 · HERO METRICS & CALORIE RING</Text>
          <Text style={styles.sectionTitle}>Calorie Ring (§3.5 Exact Geometry)</Text>

          <HeroCard style={{ marginTop: 12 }}>
            <View style={styles.heroRow}>
              <CalorieRing current={ringCalories} target={targetCalories} size={128} strokeWidth={20} />
              <View style={styles.heroTextCol}>
                <Text style={Typography.displayXL}>{targetCalories - ringCalories}</Text>
                <Text style={[Typography.body, { color: Colors.textMuted }]}>calories left</Text>
                <Text style={[Typography.monoLabel, { marginTop: 4 }]}>
                  {ringCalories} / {targetCalories} KCAL
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 20 }}>
              <View style={styles.macroRow}>
                <View style={styles.macroCol}>
                  <Text style={Typography.caption}>Protein</Text>
                  <ProgressBar progress={96 / 140} style={{ marginVertical: 6 }} />
                  <Text style={Typography.monoUnit}>96 / 140G</Text>
                </View>
                <View style={styles.macroCol}>
                  <Text style={Typography.caption}>Carbs</Text>
                  <ProgressBar progress={132 / 265} style={{ marginVertical: 6 }} />
                  <Text style={Typography.monoUnit}>132 / 265G</Text>
                </View>
                <View style={styles.macroCol}>
                  <Text style={Typography.caption}>Fat</Text>
                  <ProgressBar progress={38 / 72} style={{ marginVertical: 6 }} />
                  <Text style={Typography.monoUnit}>38 / 72G</Text>
                </View>
              </View>
            </View>
          </HeroCard>
        </View>

        {/* 4. BUTTON PRIMITIVES */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>04 · BUTTON PRIMITIVES</Text>
          <Text style={styles.sectionTitle}>Height 56px · Radius 16px</Text>

          <View style={styles.gap12}>
            <Button label="Primary Action (Get started)" variant="primary" onPress={() => {}} />
            <Button label="Secondary Action (Outline)" variant="secondary" onPress={() => {}} />
            <Button
              label="Continue with Apple"
              variant="apple"
              icon={<Apple size={20} color={Colors.cream} />}
              onPress={() => {}}
            />
            <Button label="Loading State" variant="primary" loading onPress={() => {}} />
            <Button label="Disabled Button" variant="primary" disabled onPress={() => {}} />
          </View>
        </View>

        {/* 5. SELECTABLE OPTION CARDS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>05 · SELECTABLE OPTION CARDS</Text>
          <Text style={styles.sectionTitle}>Goal Selection Cards (§4 Screen 03)</Text>

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
        </View>

        {/* 6. INPUTS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>06 · TEXT INPUTS</Text>
          <Text style={styles.sectionTitle}>Inputs with MONO LABEL & 7px Gap</Text>

          <Input
            label="HAVERFORD EMAIL"
            value={inputVal}
            onChangeText={setInputVal}
            placeholder="username@haverford.edu"
          />
          <Input
            label="PASSWORD"
            value={passwordVal}
            onChangeText={setPasswordVal}
            secureTextEntry
          />
          <Input
            label="ERROR STATE"
            value="invalid@gmail.com"
            error="Please use your @haverford.edu or @brynmawr.edu address"
          />
        </View>

        {/* 7. CONTROLS, CHIPS & STEPPERS */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>07 · CHIPS, CONTROLS & BADGES</Text>
          <Text style={styles.sectionTitle}>Interactive Steppers & Tags</Text>

          <Text style={[Typography.monoLabel, { marginBottom: 8 }]}>SEGMENTED CONTROLS</Text>
          <SegmentedControl
            options={[
              { value: 'lunch', label: 'Lunch' },
              { value: 'dinner', label: 'Dinner' },
              { value: 'coop', label: 'Coop' },
            ]}
            value={mealSegment}
            onChange={setMealSegment}
            style={{ marginBottom: 16 }}
          />

          <Text style={[Typography.monoLabel, { marginBottom: 8 }]}>PORTION STEPPER (0.25 INCREMENTS)</Text>
          <View style={{ alignItems: 'center', marginVertical: 8 }}>
            <Stepper
              value={portion}
              onChange={setPortion}
              step={0.25}
              unitLabel="plate"
            />
          </View>

          <Text style={[Typography.monoLabel, { marginTop: 16, marginBottom: 8 }]}>DIETARY & ALLERGEN CHIPS</Text>
          <View style={styles.chipRow}>
            <Chip label="Vegan" variant="green" />
            <Chip label="Vegetarian" variant="green" />
            <Chip label="92% Match" variant="scarlet" />
            <Chip label="~Estimated" variant="amber" />
            <Chip label="Contains Soy" variant="muted" />
          </View>

          <Text style={[Typography.monoLabel, { marginTop: 16, marginBottom: 8 }]}>STREAK BADGE</Text>
          <StreakBadge days={12} />
        </View>

        {/* Footer disclaimer */}
        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            SquirrelTrack 1.0 · made by Haverford students. Not affiliated with Haverford College Dining Services.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Swatch({
  color,
  name,
  hex,
  textColor = Colors.ink,
  border = false,
}: {
  color: string;
  name: string;
  hex: string;
  textColor?: string;
  border?: boolean;
}) {
  return (
    <View style={styles.swatchWrapper}>
      <View
        style={[
          styles.swatchBox,
          { backgroundColor: color },
          border && { borderWidth: 1, borderColor: Colors.border },
        ]}
      />
      <Text style={[Typography.monoLabel, { fontSize: 10, marginTop: 4 }]}>{name}</Text>
      <Text style={[Typography.monoUnit, { fontSize: 9 }]}>{hex}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    padding: 20,
    paddingBottom: 60,
  },
  header: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickLinks: {
    marginTop: 16,
  },
  section: {
    marginBottom: 28,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    color: Colors.scarlet,
    marginBottom: 4,
  },
  sectionTitle: {
    ...Typography.displayM,
    color: Colors.ink,
    marginBottom: 12,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  iconItem: {
    alignItems: 'center',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  swatchWrapper: {
    width: 96,
  },
  swatchBox: {
    width: '100%',
    height: 48,
    borderRadius: Radii.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTextCol: {
    marginLeft: 20,
    flex: 1,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroCol: {
    flex: 1,
  },
  gap12: {
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textFaint,
    textAlign: 'center',
  },
});
