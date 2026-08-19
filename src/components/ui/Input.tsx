import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { Colors, Radii, Fonts, Typography } from '@/constants/theme';
import { Eye, EyeOff } from 'lucide-react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  hint?: string;
}

export function Input({
  label,
  error,
  containerStyle,
  hint,
  secureTextEntry,
  style,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(!secureTextEntry);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.focused,
          error ? styles.errorBorder : null,
        ]}
      >
        <TextInput
          placeholderTextColor={Colors.textGhost}
          style={[styles.input, style]}
          secureTextEntry={secureTextEntry ? !showPassword : false}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeBtn}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
          >
            {showPassword ? (
              <EyeOff size={20} color={Colors.textMuted} />
            ) : (
              <Eye size={20} color={Colors.textMuted} />
            )}
          </Pressable>
        ) : null}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    ...Typography.monoLabel,
    marginBottom: 7,
  },
  inputWrapper: {
    height: 54,
    borderRadius: Radii.input,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  focused: {
    borderColor: Colors.scarlet,
  },
  errorBorder: {
    borderColor: Colors.scarletBright,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.outfit.regular,
    color: Colors.ink,
    height: '100%',
  },
  eyeBtn: {
    padding: 8,
    marginRight: -4,
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.outfit.regular,
    color: Colors.textMuted,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Fonts.outfit.medium,
    color: Colors.scarletBright,
    marginTop: 4,
  },
});
