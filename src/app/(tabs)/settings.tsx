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
import { Card, Button } from '@/components/ui';
import {
  User,
  Heart,
  FileText,
  Download,
  Trash2,
  ExternalLink,
  LogOut,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const goal = useAuthStore((state) => state.goal);
  const signOut = useAuthStore((state) => state.signOut);
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
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>CAMPUS & HEALTH RESOURCES</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={() => Linking.openURL('https://www.haverford.edu/caps')}
              style={styles.menuRow}
            >
              <Heart size={18} color={Colors.scarlet} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Haverford CAPS</Text>
                <Text style={Typography.caption}>Counseling & Psychological Services</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() =>
                Linking.openURL('https://www.haverford.edu/dining-services/nutrition-and-dietary-support')
              }
              style={styles.menuRow}
            >
              <Sparkles size={18} color={Colors.gold} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>Bi-Co Campus Dietitian</Text>
                <Text style={Typography.caption}>Dining Services Nutrition Support</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL('https://www.allianceforeatingdisorders.com/')}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <Heart size={18} color={Colors.textMuted} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={Typography.bodySSemiBold}>National Eating Disorders Helpline</Text>
                <Text style={Typography.caption}>Free, confidential support & resources</Text>
              </View>
              <ExternalLink size={16} color={Colors.textMuted} />
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
              <Download size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Download All Data (JSON)</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/privacy' as any)}
              style={styles.menuRow}
            >
              <FileText size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Privacy Policy</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal/terms' as any)}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <FileText size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Terms of Service</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={handleSignOut}
            style={{ marginBottom: 12 }}
          />

          <Button
            label="Delete Account & All Data"
            variant="destructive"
            onPress={handleDeleteAccount}
            loading={deleting}
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
