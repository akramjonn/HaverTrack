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
import { ArrowLeft, Shield } from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Privacy Policy</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={Typography.displayL}>Privacy Policy</Text>
          <Text style={[Typography.monoLabel, { marginTop: 4 }]}>LAST UPDATED: SEPTEMBER 2026</Text>
        </View>

        <Text style={styles.paragraph}>
          HaverTrack is an independent student application built for the Haverford and Bryn Mawr College communities. We take student privacy seriously.
        </Text>

        <Text style={styles.sectionHeader}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          • College Email: Used solely to authenticate domain membership (@haverford.edu or @brynmawr.edu).{'\n'}
          • Meal Logs & Goals: Saved privately in your encrypted user account to calculate daily nutrition.{'\n'}
          • Food Photos: Meal images sent to the vision analysis API are stripped of GPS EXIF metadata client-side and automatically deleted within 30 days.
        </Text>

        <Text style={styles.sectionHeader}>2. Third-Party Services</Text>
        <Text style={styles.paragraph}>
          • Nutrislice: Public dining menus and dietitian nutrition numbers.{'\n'}
          • Anthropic Claude API: Private image analysis without retaining training data.{'\n'}
          • OpenFoodFacts: Public packaged food barcode database.
        </Text>

        <Text style={styles.sectionHeader}>3. Data Retention & Deletion</Text>
        <Text style={styles.paragraph}>
          You have full control over your data. You may download a complete JSON export or permanently delete your account and all meal logs directly from the Settings tab at any time (compliant with Apple Guideline 5.1.1(v)).
        </Text>

        <Text style={styles.sectionHeader}>4. Food Feedback and Reminders</Text>
        <Text style={styles.paragraph}>
          Your optional meal and dish ratings, feedback tags, and comments are stored with your meal. Authorized administrators can review feedback and aggregate dining statistics. Named student records are restricted and access is audited. Food feedback reports do not include meal photos or detailed weight history.
        </Text>
        <Text style={styles.paragraph}>
          If you enable rating reminders, we store a device notification token and your timezone and use Expo Push Service with Apple or Google to send reminders. You can turn reminders off in settings. Meal-selection events are retained for 90 days. Ratings, notification preferences, device associations, and reminder records are deleted with your account; ratings attached to a deleted meal are also deleted.
        </Text>
        <Text style={styles.paragraph}>
          HaverTrack is not officially affiliated with or endorsed by Haverford College Dining Services.
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
