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

interface WeightModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WeightModal({ visible, onClose }: WeightModalProps) {
  const addWeightEntry = useLogStore((state) => state.addWeightEntry);
  const [weightText, setWeightText] = useState('165.4');
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const num = parseFloat(weightText.trim());
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid weight.');
      return;
    }

    const weight_kg = unit === 'lb' ? Math.round(num * 0.45359237 * 10) / 10 : num;

    if (weight_kg < 20 || weight_kg > 300) {
      setError('Weight must be between 45 lb and 660 lb.');
      return;
    }

    setLoading(true);
    await addWeightEntry(weight_kg);
    setLoading(false);
    onClose();
  };

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
                label={`WEIGHT (${unit.toUpperCase()})`}
                value={weightText}
                onChangeText={(t) => {
                  setWeightText(t);
                  setError(null);
                }}
                keyboardType="numeric"
                placeholder="165.4"
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
      </KeyboardAvoidingView>
    </Modal>
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
