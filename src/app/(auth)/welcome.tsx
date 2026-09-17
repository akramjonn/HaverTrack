import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Apple, Flame, Plus } from 'lucide-react-native';
import { Colors, Fonts, Radii, Typography } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function WelcomeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View>
          <View style={styles.brandRow}><Apple size={28} color={Colors.ink} fill={Colors.ink} /><Text style={styles.brand}>HaverTrack</Text></View>
          <Text style={styles.title}>Know what fuels your day.</Text>
          <Text style={styles.subtitle}>Track Haverford dining with a quick scan, clear nutrition totals, and goals that stay practical.</Text>
          <View style={styles.preview} accessibilityLabel="Illustration of the HaverTrack dashboard">
            <View style={styles.previewTop}><Text style={styles.previewKicker}>TODAY</Text><View style={styles.streak}><Flame size={17} color="#EA704A" fill="#EA704A" /><Text style={styles.streakText}>Build your streak</Text></View></View>
            <View style={styles.calorieCard}><View><Text style={styles.previewNumber}>—</Text><Text style={styles.previewLabel}>calories remaining</Text></View><View style={styles.previewRing}><Apple size={25} color={Colors.ink} fill={Colors.ink} /></View></View>
            <View style={styles.previewMacros}><PreviewMacro label="Protein" /><PreviewMacro label="Carbs" /><PreviewMacro label="Fat" /></View>
            <View style={styles.previewAdd}><Plus size={24} color={Colors.cream} /></View>
          </View>
        </View>
        <View>
          <Button label="Get started" variant="primary" onPress={() => router.push('/(auth)/sign-up' as never)} style={{ marginBottom: 12 }} />
          <Button label="I already have an account" variant="secondary" onPress={() => router.push('/(auth)/sign-in' as never)} style={{ marginBottom: 18 }} />
          <Text style={styles.disclaimer}>An independent student project for Haverford dining.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PreviewMacro({ label }: { label: string }) {
  return <View style={styles.previewMacro}><View style={styles.previewMacroDot} /><Text style={styles.previewMacroText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F6' },
  container: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 26, paddingBottom: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 38 },
  brand: { fontFamily: Fonts.outfit.extraBold, fontSize: 27, color: Colors.ink, letterSpacing: -1 },
  title: { fontFamily: Fonts.outfit.extraBold, fontSize: 42, lineHeight: 45, letterSpacing: -1.8, color: Colors.ink, maxWidth: 330 },
  subtitle: { ...Typography.bodyL, color: Colors.textMuted, marginTop: 14, maxWidth: 340 },
  preview: { marginTop: 28, backgroundColor: '#ECECEF', borderRadius: Radii.cardLg, padding: 18, minHeight: 290, overflow: 'hidden' },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewKicker: { ...Typography.monoLabel, color: Colors.textMuted },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.surface, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  streakText: { ...Typography.micro, color: Colors.ink },
  calorieCard: { marginTop: 20, backgroundColor: Colors.surface, borderRadius: Radii.card, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewNumber: { fontFamily: Fonts.outfit.extraBold, fontSize: 50, lineHeight: 50, color: Colors.ink, letterSpacing: -2 },
  previewLabel: { ...Typography.body, color: Colors.inkSoft },
  previewRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 13, borderColor: '#F0F0F4', alignItems: 'center', justifyContent: 'center' },
  previewMacros: { flexDirection: 'row', gap: 8, marginTop: 12 },
  previewMacro: { flex: 1, minHeight: 70, backgroundColor: Colors.surface, borderRadius: Radii.md, padding: 10, justifyContent: 'space-between' },
  previewMacroDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#F0F0F4' },
  previewMacroText: { ...Typography.micro, color: Colors.inkSoft },
  previewAdd: { position: 'absolute', right: 22, bottom: -16, width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.ink, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { ...Typography.micro, color: Colors.textMuted, textAlign: 'center' },
});
