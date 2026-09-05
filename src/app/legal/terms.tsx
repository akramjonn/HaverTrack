import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { IconButton } from '@/components/ui';
import { ArrowLeft } from 'lucide-react-native';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Terms of Service</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={Typography.displayL}>Terms of Service</Text>
          <Text style={[Typography.monoLabel, { marginTop: 4 }]}>LAST UPDATED: AUGUST 2026</Text>
        </View>

        <Text style={styles.paragraph}>
          By using HaverTrack, you agree to these Terms of Service.
        </Text>

        <Text style={styles.sectionHeader}>1. Informational Health Disclaimer</Text>
        <Text style={styles.paragraph}>
          HaverTrack is designed solely for informational and educational purposes for students. The application does NOT provide medical, clinical, or formal nutritional advice. Calorie and macro values are sourced from third-party dining menus or estimated via computer vision and may vary from actual preparation.
        </Text>

        <Text style={styles.sectionHeader}>2. Allergen Notice & Cross-Contact</Text>
        <Text style={styles.paragraph}>
          Commercial dining kitchens prepare multiple food items and cross-contact risk is always present. Never rely solely on an app for severe food allergies. Always confirm ingredients directly with dining hall staff.
        </Text>

        <Text style={styles.sectionHeader}>3. Wellbeing Guardrails</Text>
        <Text style={styles.paragraph}>
          HaverTrack enforces strict health floors (minimum 1,200 kcal/day) and rate clamps. The service must not be used for extreme caloric restriction or unsafe weight loss practices.
        </Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  sectionHeader: {
    ...Typography.title,
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    ...Typography.body,
    color: Colors.textMuted,
    lineHeight: 24,
  },
});
