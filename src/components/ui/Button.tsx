import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import { Colors, Radii, Fonts } from '@/constants/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'secondaryDark'
  | 'outline'
  | 'ghost'
  | 'apple'
  | 'google'
  | 'destructive';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
  accessibilityLabel,
}: ButtonProps) {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: Colors.scarlet,
          borderWidth: 0,
        };
      case 'secondary':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: Colors.border,
        };
      case 'secondaryDark':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: Colors.darkBorder,
        };
      case 'apple':
        return {
          backgroundColor: Colors.ink,
          borderWidth: 0,
        };
      case 'google':
        return {
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
        };
      case 'outline':
        return {
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderWidth: 0,
        };
      case 'destructive':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: 'rgba(226, 58, 80, 0.4)',
        };
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'primary':
        return {
          color: Colors.cream,
          fontFamily: Fonts.outfit.semiBold,
          fontSize: 17,
        };
      case 'secondary':
        return {
          color: Colors.ink,
          fontFamily: Fonts.outfit.medium,
          fontSize: 17,
        };
      case 'secondaryDark':
        return {
          color: Colors.darkText,
          fontFamily: Fonts.outfit.medium,
          fontSize: 17,
        };
      case 'apple':
        return {
          color: Colors.cream,
          fontFamily: Fonts.outfit.semiBold,
          fontSize: 17,
        };
      case 'google':
        return {
          color: Colors.ink,
          fontFamily: Fonts.outfit.semiBold,
          fontSize: 17,
        };
      case 'outline':
        return {
          color: Colors.ink,
          fontFamily: Fonts.outfit.medium,
          fontSize: 16,
        };
      case 'ghost':
        return {
          color: Colors.scarlet,
          fontFamily: Fonts.outfit.medium,
          fontSize: 16,
        };
      case 'destructive':
        return {
          color: Colors.scarletBright,
          fontFamily: Fonts.outfit.medium,
          fontSize: 16,
        };
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [
        styles.base,
        getContainerStyle(),
        disabled && styles.disabled,
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'apple' ? Colors.cream : Colors.scarlet}
        />
      ) : (
        <>
          {icon ? <>{icon}</> : null}
          <Text style={[styles.textBase, getTextStyle(), icon ? { marginLeft: 10 } : null, textStyle]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: Radii.btn,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    minWidth: 44,
  },
  textBase: {
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
