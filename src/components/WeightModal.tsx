import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Input, IconButton } from '@/components/ui';
import { X, Scale } from 'lucide-react-native';
import { useLogStore } from '@/store/logStore';
import { parseWeightToKg, useUnits } from '@/lib/units';

interface WeightModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WeightModal({ visible, onClose }: WeightModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* Keyed by `visible`: RN's Modal keeps its children mounted across
            open/close, so remounting on that boolean is what resets the form
            on each new open — not an effect calling setState after mount. */}
        <WeightForm key={String(visible)} onClose={onClose} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface WeightFormProps {
  onClose: () => void;
}

function WeightForm({ onClose }: WeightFormProps) {
  const addWeightEntry = useLogStore((state) => state.addWeightEntry);
  const units = useUnits();
  const unitLabel = units === 'imperial' ? 'LB' : 'KG';
  const [weightText, setWeightText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const weight_kg = parseWeightToKg(weightText, units);
    if (weight_kg === null) {
      setError('Please enter a valid weight.');
      return;
    }

    if (weight_kg < 20 || weight_kg > 300) {
      setError(
        units === 'imperial'
          ? 'Weight must be between 45 lb and 660 lb.'
          : 'Weight must be between 20 kg and 300 kg.'
      );
      return;
    }

    setLoading(true);
    await addWeightEntry(weight_kg);
    setLoading(false);
    onClose();
  };

  return (
    <View style={styles.dialog}>
      <View style={styles.dialogHeader}>
        <View style={styles.iconCircle}>
          <Scale size={20} color={Colors.scarlet} />
        </View>
        <IconButton
          icon={<X size={18} color={Colors.inkSoft} />}
          onPress={onClose}
          accessibilityLabel="Close weight dialog"
        />
      </View>

      <Text style={Typography.title}>Record weight</Text>
      <Text style={[Typography.bodyS, { color: Colors.textMuted, marginTop: 4, marginBottom: 20 }]}>
        Recorded in your private progress history.
      </Text>

      <View style={styles.inputRow}>
        <View style={{ flex: 1 }}>
          <Input
            label={`WEIGHT (${unitLabel})`}
            value={weightText}
            onChangeText={(t) => {
              setWeightText(t);
              setError(null);
            }}
            keyboardType="numeric"
            placeholder={units === 'imperial' ? '165.4' : '75.0'}
          />
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button
        label="Save entry"
        variant="primary"
        onPress={handleSave}
        loading={loading}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
  },
  errorText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.scarletBright,
    marginBottom: 8,
  },
});
