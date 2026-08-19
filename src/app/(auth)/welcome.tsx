import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { AppIcon, Button } from '@/components/ui';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Top Spacer & Centered Hero Block */}
        <View style={styles.heroBlock}>
          {/* 112x112 rounded-25 tile */}
          <View style={styles.iconTile}>
            <AppIcon size={88} variant="dark" />
          </View>

          {/* 40px w700 Display XL headline */}
          <Text style={styles.headline}>Know what the DC is feeding you.</Text>

          {/* 16px subcopy */}
          <Text style={styles.subcopy}>
            Snap a plate, get calories and macros in seconds. Built for Haverford dining.
          </Text>
        </View>

        {/* Bottom Actions */}
        <View style={styles.actionBlock}>
          <Button
            label="Get started"
            variant="primary"
            onPress={() => router.push('/(auth)/sign-up' as any)}
            style={{ marginBottom: 12 }}
          />

          <Button
            label="I already have an account"
            variant="secondaryDark"
            onPress={() => router.push('/(auth)/sign-in' as any)}
            style={{ marginBottom: 24 }}
          />

          {/* 12px disclaimer */}
          <Text style={styles.disclaimer}>
            Not affiliated with Haverford College Dining Services.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
  },
  heroBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconTile: {
    width: 112,
    height: 112,
    borderRadius: 25,
    backgroundColor: Colors.darkSurface,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  headline: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.4,
    color: Colors.darkText,
    textAlign: 'center',
    marginBottom: 16,
  },
  subcopy: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.textFainter,
    textAlign: 'center',
    maxWidth: 320,
  },
  actionBlock: {
    width: '100%',
  },
  disclaimer: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 16.8,
    color: Colors.darkTextDim,
    textAlign: 'center',
  },
});
