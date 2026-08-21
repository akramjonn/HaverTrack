import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { Colors, Typography, Fonts, Radii } from '@/constants/theme';
import { Card, IconButton } from '@/components/ui';
import { BmiScaleBar, BmiLegend } from '@/components/BmiCard';
import { calculateBmi, bmiCategory } from '@/lib/bmi';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';

const SOURCE_URL = 'https://www.cdc.gov/healthyweight/assessing/bmi/adult_bmi/index.html';

const WHY_IT_MATTERS = [
  'Type 2 diabetes',
  'High blood pressure and heart disease',
  'Certain cancers',
  'Joint strain and osteoarthritis',
  'Sleep apnea and breathing difficulty',
];

export default function BmiInfoScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const weightEntries = useLogStore((s) => s.weightEntries);

  const latestEntry = weightEntries[weightEntries.length - 1];
  const weightKg = latestEntry?.weight_kg ?? profile?.weight_kg ?? null;
  const bmi = calculateBmi({ weight_kg: weightKg, height_cm: profile?.height_cm ?? null });
  const category = bmi !== null ? bmiCategory(bmi, profile?.age) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={[Typography.title, { marginLeft: 12 }]}>About BMI</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {bmi !== null && category ? (
          <Card style={styles.card}>
            <Text style={Typography.monoLabel}>YOUR BMI</Text>
            <Text style={[Typography.displayXL, { marginTop: 6 }]}>{bmi.toFixed(1)}</Text>
            <View
              style={[
                styles.categoryPill,
                { backgroundColor: `${category.color}1F`, borderColor: category.color },
              ]}
            >
              <Text style={[styles.categoryPillText, { color: category.color }]}>{category.label}</Text>
            </View>
            <BmiScaleBar bmi={bmi} style={{ marginTop: 20 }} />
            <BmiLegend />
          </Card>
        ) : null}

        <Text style={styles.sectionHeading}>Disclaimer</Text>
        <Text style={styles.body}>
          Body mass index is a simple ratio of weight to height — it is not a diagnosis and it
          does not directly measure body fat. It does not account for muscle mass, bone density,
          overall body composition, or where fat is carried, so two people with the same BMI can
          be in very different health situations. It is one screening number among many, not a
          verdict.
        </Text>

        <Text style={styles.sectionHeading}>Why doesn&apos;t SquirrelTrack score everyone?</Text>
        <Text style={styles.body}>
          The standard adult BMI bands (Underweight / Healthy / Overweight / Obese) are built
          from research on adults 20 and older. Below age 20, the CDC instead uses age- and
          sex-specific growth percentiles, because bodies are still developing and the same BMI
          number means something different at 15 than it does at 35. SquirrelTrack doesn&apos;t
          collect sex, so percentile scoring isn&apos;t something we can compute responsibly. Rather
          than apply adult cutoffs to a group they weren&apos;t built for, anyone under 20 sees a
          neutral &quot;Adult ranges shown&quot; label instead of a graded category — the number and scale
          are still shown, just without a judgment attached.
        </Text>

        <Text style={styles.sectionHeading}>So then, why does BMI matter?</Text>
        <Text style={[styles.body, { marginBottom: 12 }]}>
          At a population level, a higher BMI correlates with higher risk of several conditions,
          which is why clinicians still use it as a quick, free screening tool alongside other
          measurements:
        </Text>
        <View style={styles.list}>
          {WHY_IT_MATTERS.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeading}>Source</Text>
        <Pressable
          onPress={() => Linking.openURL(SOURCE_URL)}
          style={styles.sourceRow}
          accessibilityRole="link"
        >
          <Text style={styles.sourceText}>CDC — About Adult BMI</Text>
          <ExternalLink size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: 48,
  },
  card: {
    marginTop: 8,
    marginBottom: 24,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  categoryPillText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
  },
  sectionHeading: {
    ...Typography.title,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    ...Typography.body,
    color: Colors.inkSoft,
  },
  list: {
    marginTop: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.scarlet,
    marginTop: 8,
    marginRight: 10,
  },
  listText: {
    ...Typography.body,
    color: Colors.inkSoft,
    flex: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sourceText: {
    ...Typography.bodySSemiBold,
    color: Colors.ink,
    textDecorationLine: 'underline',
  },
});
