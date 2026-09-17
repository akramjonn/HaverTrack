import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react-native';
import { Colors, Radii, Typography } from '@/constants/theme';
import { IconButton } from '@/components/ui';
import {
  usePreferences,
  useSavePreferences,
  type ClockFormat,
  type HeightUnit,
  type WeightUnit,
} from '@/lib/preferences';
import { useAuthStore } from '@/store/authStore';

type Choice<T extends string> = { value: T; label: string };

const weightChoices: Choice<WeightUnit>[] = [
  { value: 'lb', label: 'Pounds' },
  { value: 'kg', label: 'Kilograms' },
];
const heightChoices: Choice<HeightUnit>[] = [
  { value: 'ft_in', label: 'Feet and inches' },
  { value: 'cm', label: 'Centimeters' },
];
const clockChoices: Choice<ClockFormat>[] = [
  { value: '12h', label: '12 hour' },
  { value: '24h', label: '24 hour' },
];

export default function UnitsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const legacyUnits = useAuthStore((state) => state.profile?.units ?? 'imperial');
  const preferences = usePreferences(user?.id, legacyUnits);
  const save = useSavePreferences(user?.id, legacyUnits);

  if (!user) return <Redirect href="/(auth)/welcome" />;

  const update = (patch: Parameters<typeof save.mutate>[0]) => {
    save.mutate(patch, {
      onError: (error) => Alert.alert('Could not update units', error.message || 'Please try again.'),
    });
  };
  const value = preferences.data;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton
          icon={<ArrowLeft size={20} color={Colors.ink} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          shape="circle"
          variant="light"
        />
        <Text style={styles.title}>Units</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ChoiceGroup
          label="Weight units"
          value={value?.weight_unit ?? (legacyUnits === 'metric' ? 'kg' : 'lb')}
          choices={weightChoices}
          disabled={preferences.isLoading || save.isPending}
          onChange={(weight_unit) => update({ weight_unit })}
        />
        <ChoiceGroup
          label="Height units"
          value={value?.height_unit ?? (legacyUnits === 'metric' ? 'cm' : 'ft_in')}
          choices={heightChoices}
          disabled={preferences.isLoading || save.isPending}
          onChange={(height_unit) => update({ height_unit })}
        />
        <ChoiceGroup
          label="Clock units"
          value={value?.clock_format ?? '12h'}
          choices={clockChoices}
          disabled={preferences.isLoading || save.isPending}
          onChange={(clock_format) => update({ clock_format })}
        />
        <Text style={styles.note}>
          Changing units only changes how your data is displayed. Your measurements stay accurate.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  disabled,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <View style={[styles.group, disabled && styles.groupDisabled]}>
        {choices.map((choice, index) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              style={[styles.choice, index === choices.length - 1 && styles.choiceLast]}
              onPress={() => onChange(choice.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={choice.label}
            >
              <Text style={styles.choiceText}>{choice.label}</Text>
              {selected ? (
                <CheckCircle2 size={26} color={Colors.ink} fill={Colors.ink} />
              ) : (
                <Circle size={26} color={Colors.textMuted} strokeWidth={2.4} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F6' },
  header: {
    height: 64,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEE',
  },
  headerSpacer: { width: 40 },
  title: { ...Typography.title, fontSize: 20, color: Colors.ink },
  content: { padding: 28, paddingBottom: 48 },
  section: { marginBottom: 38 },
  sectionTitle: { ...Typography.displayM, fontSize: 30, marginBottom: 18 },
  group: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    overflow: 'hidden',
  },
  groupDisabled: { opacity: 0.6 },
  choice: {
    minHeight: 84,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DEDEE1',
  },
  choiceLast: { borderBottomWidth: 0 },
  choiceText: { ...Typography.title, fontSize: 20 },
  note: { ...Typography.bodyS, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
});
