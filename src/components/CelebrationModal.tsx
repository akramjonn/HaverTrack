import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  withDelay,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Flame, Droplet } from 'lucide-react-native';
import { Colors, Typography, Radii } from '@/constants/theme';
import { Button } from '@/components/ui';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const ICON_SPRING = { damping: 14, stiffness: 260 };
const DOT_STAGGER_MS = 140;
const DOT_DURATION_MS = 180;

interface CelebrationModalProps {
  visible: boolean;
  onDismiss: () => void;
  icon: 'flame' | 'droplet';
  title: string;
  subtitle: string;
  /** Streak variant only — Sun-Sat filled state. Omit for water. */
  weekDots?: boolean[];
  ctaLabel?: string;
}

/**
 * Full-screen modal takeover for a positive milestone the user opted into
 * (streak day, hydration goal). Mirrors WeightModal's overlay/backdrop/dialog
 * mechanics and PhotoDetailSheet/AppTabBar's useReducedMotion() gating idiom
 * (reduced motion snaps straight to the settled state, no partial-duration
 * compromise) rather than inventing a new modal pattern.
 */
export function CelebrationModal({
  visible,
  onDismiss,
  icon,
  title,
  subtitle,
  weekDots,
  ctaLabel = 'Continue',
}: CelebrationModalProps) {
  const reducedMotion = useReducedMotion();
  const iconScale = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (!visible) return;

    if (reducedMotion) {
      iconScale.value = 1;
    } else {
      iconScale.value = 0;
      iconScale.value = withSpring(1, ICON_SPRING);
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [visible, reducedMotion, iconScale]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const isFlame = icon === 'flame';
  const iconBg = isFlame ? Colors.amberBg : '#E3EFFC';
  const iconColor = isFlame ? Colors.amber : '#2F6FED';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />

        <View style={styles.dialog}>
          <Animated.View style={[styles.iconCircle, { backgroundColor: iconBg }, iconAnimatedStyle]}>
            {isFlame ? (
              <Flame size={64} color={iconColor} />
            ) : (
              <Droplet size={64} color={iconColor} />
            )}
          </Animated.View>

          <Text style={[Typography.displayM, styles.title]}>{title}</Text>
          <Text style={[Typography.body, styles.subtitle]}>{subtitle}</Text>

          {weekDots ? (
            <View style={styles.weekRow}>
              {weekDots.map((filled, index) => (
                <WeekDot
                  key={index}
                  label={DAY_LETTERS[index]}
                  filled={filled}
                  delay={index * DOT_STAGGER_MS}
                  visible={visible}
                  reducedMotion={reducedMotion}
                />
              ))}
            </View>
          ) : null}

          <Button
            label={ctaLabel}
            variant="primary"
            onPress={onDismiss}
            style={styles.cta}
          />
        </View>
      </View>
    </Modal>
  );
}

interface WeekDotProps {
  label: string;
  filled: boolean;
  delay: number;
  visible: boolean;
  reducedMotion: boolean;
}

function WeekDot({ label, filled, delay, visible, reducedMotion }: WeekDotProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible || !filled) {
      progress.value = 0;
      return;
    }

    if (reducedMotion) {
      progress.value = 1;
    } else {
      progress.value = 0;
      progress.value = withDelay(delay, withTiming(1, { duration: DOT_DURATION_MS }));
    }
  }, [visible, filled, delay, reducedMotion, progress]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [Colors.track, Colors.gold]),
    transform: [{ scale: 0.82 + progress.value * 0.18 }],
  }));

  return (
    <View style={styles.dotCol}>
      <Animated.View style={[styles.dot, dotAnimatedStyle]} />
      <Text style={styles.dotLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.surface,
    borderRadius: Radii.cardLg,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  iconCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  dotCol: {
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  dotLabel: {
    ...Typography.monoUnit,
    color: Colors.textFaint,
  },
  cta: {
    width: '100%',
    marginTop: 24,
  },
});
