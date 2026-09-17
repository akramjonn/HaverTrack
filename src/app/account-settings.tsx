import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Linking,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Typography, Radii } from '@/constants/theme';
import { Card, Button, IconButton } from '@/components/ui';
import {
  ArrowLeft,
  Heart,
  FileText,
  Download,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Mail,
} from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useLogStore } from '@/store/logStore';
import { useScanStore } from '@/store/scanStore';
import { supabase } from '@/lib/supabase';
import { usePreferences, useSavePreferences } from '@/lib/preferences';
import { downloadAccountExport } from '@/lib/accountExport';
import { operationalErrorCode, trackOperationalEvent } from '@/lib/observability';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const profile = useAuthStore((state) => state.profile);
  const signOut = useAuthStore((state) => state.signOut);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const purgeLocalUserData = useLogStore((state) => state.purgeLocalUserData);
  const clearScan = useScanStore((state) => state.clear);

  const legacyUnits = profile?.units ?? 'imperial';
  const preferenceQuery = usePreferences(userId, legacyUnits);
  const savePreferences = useSavePreferences(userId, legacyUnits);
  const preferences = preferenceQuery.data;

  const handleTogglePreference = async (key: 'rollover_calories', next: boolean) => {
    if (!userId) return;
    try {
      await savePreferences.mutateAsync({ [key]: next });
    } catch (err: any) {
      Alert.alert('Could not update preference', err?.message ?? 'Please try again.');
    }
  };

  const handleExportData = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      await downloadAccountExport(userId);
    } catch (error: any) {
      Alert.alert('Export failed', error?.message ?? 'Could not generate the JSON export.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    let deletedRemotely = false;
    trackOperationalEvent('account_delete_started');
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      });
      if (error) throw error;
      deletedRemotely = true;

      if (userId) {
        try {
          await purgeLocalUserData(userId);
        } catch (cleanupError) {
          console.warn('Could not remove local account data after deletion:', cleanupError);
        }
      }
      clearScan();
      try {
        await signOut();
      } catch (signOutError) {
        console.warn('Account was deleted but the remote sign-out step failed:', signOutError);
      }
      router.replace('/(auth)/welcome' as any);
      trackOperationalEvent('account_delete_completed');
    } catch (err: any) {
      trackOperationalEvent('account_delete_failed', { code: operationalErrorCode(err), deletedRemotely });
      Alert.alert(
        deletedRemotely ? 'Account deleted' : 'Could not delete account',
        deletedRemotely
          ? 'Your account was deleted. We could not finish device cleanup, so restart the app before signing in again.'
          : err?.message || 'Your account was not deleted. Check your connection and try again, or email us to remove it manually.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/welcome' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={[Typography.title, { marginLeft: 12 }]}>Account Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
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

        {/* Preferences — calorie-math toggles */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>PREFERENCES</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={[styles.menuRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={Typography.bodySSemiBold}>Rollover calories</Text>
                <Text style={Typography.caption}>
                  Carry up to 200 unused kcal from yesterday into today&apos;s goal.
                </Text>
              </View>
              <Switch
                value={preferences?.rollover_calories ?? false}
                onValueChange={(next) => handleTogglePreference('rollover_calories', next)}
                trackColor={{ false: Colors.border, true: Colors.scarlet }}
                thumbColor={Colors.surface}
                disabled={preferenceQuery.isLoading || savePreferences.isPending}
              />
            </View>
          </Card>
        </View>

        {/* Legal & Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>DATA & LEGAL</Text>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Pressable
              onPress={handleExportData}
              disabled={exporting}
              style={[styles.menuRow, exporting && styles.disabledRow]}
            >
              <Download size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>
                {exporting ? 'Preparing data export…' : 'Download All Data (JSON)'}
              </Text>
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
              style={styles.menuRow}
            >
              <FileText size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Terms of Service</Text>
              <ChevronRight size={16} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              onPress={() => Linking.openURL('mailto:support@havertrack.app')}
              style={[styles.menuRow, { borderBottomWidth: 0 }]}
            >
              <Mail size={18} color={Colors.ink} style={{ marginRight: 12 }} />
              <Text style={[Typography.bodySSemiBold, { flex: 1 }]}>Support Email</Text>
              <ExternalLink size={16} color={Colors.textMuted} />
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
            onPress={() => setShowDeleteConfirm(true)}
            loading={deleting}
          />
        </View>

        {/* Institutional Disclaimer */}
        <View style={styles.footer}>
          <Text style={styles.disclaimer}>
            HaverTrack is an independent student project.{'\n'}
            Not affiliated with or endorsed by Haverford College Dining Services.
          </Text>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={showDeleteConfirm}
        deleting={deleting}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          await handleDeleteAccount();
          setShowDeleteConfirm(false);
        }}
      />
    </SafeAreaView>
  );
}

interface DeleteAccountModalProps {
  visible: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Branded confirm dialog, mirroring WeightModal.tsx's overlay/backdrop/dialog mechanics. */
function DeleteAccountModal({ visible, deleting, onCancel, onConfirm }: DeleteAccountModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={modalStyles.overlay}
      >
        <Pressable style={modalStyles.backdrop} onPress={onCancel} />
        <View style={modalStyles.dialog}>
          <Text style={Typography.title}>Delete Account?</Text>
          <Text style={[Typography.bodyS, { color: Colors.textMuted, marginTop: 8, marginBottom: 20 }]}>
            This will permanently delete your profile, meal logs, photo scans, and weight history. This
            action cannot be undone.
          </Text>

          <View style={modalStyles.actionRow}>
            <Button
              label="No"
              variant="secondary"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            <Button
              label="Yes"
              variant="destructive"
              onPress={onConfirm}
              loading={deleting}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: Radii.cardLg,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
});

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
    paddingTop: 16,
    paddingBottom: 40,
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
  disabledRow: {
    opacity: 0.6,
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
