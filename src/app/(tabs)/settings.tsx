import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Card, Button, Icon } from '@/components/ui';
import { useAuthStore, selectIsAdmin } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const signOut = useAuthStore((state) => state.signOut);
  const isAdmin = useAuthStore(selectIsAdmin);
  const [deleting, setDeleting] = useState(false);
  const logs = useLogStore((state) => state.logs);
  const weightEntries = useLogStore((state) => state.weightEntries);

  const handleExportData = async () => {
    try {
      const exportData = JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          user: user,
          goal: goal,
          weight_entries: weightEntries,
          meal_logs: logs,
        },
        null,
        2
      );

      await Share.share({
        title: 'SquirrelTrack Data Export',
        message: exportData,
      });
    } catch (e) {
      Alert.alert('Export Failed', 'Could not generate JSON export.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & All Data',
      'This will permanently delete your profile, meal logs, photo scans, and weight history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.functions.invoke('delete-account', {
                method: 'POST',
              });
              if (error) throw error;

              await signOut();
              router.replace('/(auth)/welcome' as any);
            } catch (err: any) {
              Alert.alert(
                'Could not delete account',
                err?.message ||
                  'Your account was not deleted. Check your connection and try again, or email us to remove it manually.'
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>You</Text>
          <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 4 }]}>
            {profile?.email || user?.email || ''}
          </Text>
        </View>

        {isAdmin ? (
          <Card
            onPress={() => router.push('/(admin)' as any)}
            accessibilityLabel="Open admin console"
            style={styles.adminRow}
          >
            <Icon name="shield" size="md" color={Colors.scarlet} style={styles.rowGlyph} />
            <View style={{ flex: 1 }}>
              <Text style={Typography.bodySSemiBold}>Admin console</Text>
              <Text style={Typography.caption}>Signups, engagement, and menu health</Text>
            </View>
            <Icon name="chevronRight" size="sm" color={Colors.textMuted} />
          </Card>
        ) : null}

        {/* Current Plan Card */}
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={Typography.monoLabel}>CURRENT GOAL</Text>
              <Text style={[Typography.title, { marginTop: 4 }]}>
                {goal?.goal_type === 'tracking'
                  ? 'Just Tracking'
                  : goal?.goal_type === 'lose'
                  ? 'Gentle Fat Loss (0.5 lb/wk)'
                  : goal?.goal_type === 'gain'
                  ? 'Muscle Gain (+250 kcal)'
                  : 'Maintenance'}
              </Text>
              <Text style={[Typography.caption, { color: Colors.textMuted, marginTop: 2 }]}>
                {goal?.calorie_target ? `${goal.calorie_target} kcal/day` : 'No calorie limits applied'}
              </Text>
            </View>
            <Button
              label="Edit"
              variant="secondary"
              onPress={() => router.push('/(onboarding)/goal' as any)}
              style={{ height: 38, paddingHorizontal: 16 }}
            />
          </View>
        </Card>

        {/* Campus Wellbeing Resources Section (§11 & §13) */}
        {/*
          Every leading glyph in these two cards is ink at one size, the way
          Affirm and Tabby draw a settings list. The rows used to run scarlet
          heart / gold sparkle / grey heart / ink download, which made the list
          read as four unrelated things and spent the brand's accent colours on
          rows that are not more important than their neighbours. Colour here is
          reserved for the one row that is genuinely elevated — admin — and for
          the destructive action at the bottom.
        */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CAMPUS & HEALTH RESOURCES</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => Linking.openURL('https://www.haverford.edu/caps')}
              style={styles.menuRow}
            >
              <Icon name="care" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Haverford CAPS</Text>
                <Text style={Typography.caption}>Counseling & Psychological Services</Text>
              </View>
              <Icon name="external" size="sm" color={Colors.textMuted} label="Opens in browser" />
            </Pressable>

            <Pressable
              onPress={() =>
                Linking.openURL('https://www.haverford.edu/dining-services/nutrition-and-dietary-support')
              }
              style={styles.menuRow}
            >
              <Icon name="menu" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Bi-Co Campus Dietitian</Text>
                <Text style={Typography.caption}>Dining Services Nutrition Support</Text>
              </View>
              <Icon name="external" size="sm" color={Colors.textMuted} label="Opens in browser" />
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL('https://www.allianceforeatingdisorders.com/')}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <Icon name="wellbeing" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>National Eating Disorders Helpline</Text>
                <Text style={Typography.caption}>Free, confidential support & resources</Text>
              </View>
              <Icon name="external" size="sm" color={Colors.textMuted} label="Opens in browser" />
            </Pressable>
          </Card>
        </View>

        {/* Legal & Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>DATA & LEGAL</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={handleExportData}
              style={styles.menuRow}
            >
              <Icon name="download" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Download All Data (JSON)</Text>
              <Icon name="chevronRight" size="sm" color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/privacy' as any)}
              style={styles.menuRow}
            >
              <Icon name="shield" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Privacy Policy</Text>
              <Icon name="chevronRight" size="sm" color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/terms' as any)}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <Icon name="document" size="md" color={Colors.ink} style={styles.rowGlyph} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Terms of Service</Text>
              <Icon name="chevronRight" size="sm" color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={handleSignOut}
            icon={<Icon name="signOut" size="md" color={Colors.ink} />}
            style={{ marginBottom: 12 }}
          />

          {/*
            The only icon in this screen that is not a scanning aid: a trash
            glyph on a red-bordered button is a second, pre-verbal signal that
            this control destroys data, and it fires before the label is read.
          */}
          <Button
            label="Delete Account & All Data"
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={deleting}
            icon={<Icon name="trash" size="md" color={Colors.scarletBright} />}
          />
        </View>

        {/* Institutional Disclaimer */}
        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            SquirrelTrack is an independent student project.{'\n'}
            Not affiliated with or endorsed by Haverford College Dining Services.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  card: {
    marginBottom: 20,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    marginBottom: 24,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  rowGlyph: {
    marginRight: 12,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
