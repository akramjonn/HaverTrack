import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import {
  X,
  Zap,
  ZapOff,
  Image as ImageIcon,
  ChevronDown,
  Sparkles,
  Barcode,
  CameraOff,
} from 'lucide-react-native';
import { Button } from '@/components/ui';
import { analyzePlate } from '@/lib/llm/provider';
import { lookupBarcode, barcodeProductToSearchResult } from '@/lib/productLookup';
import { FoodComposeSheet } from '@/components/FoodComposeSheet';
import type { FoodSearchResult } from '@/lib/foodSearch';
import { prepareImageForAnalysis } from '@/lib/image';
import { useMenuStore } from '@/store/menuStore';
import { useScanStore } from '@/store/scanStore';
import { ShutterButton } from '@/components/scan/ShutterButton';
import { CaptureFreezeFrame } from '@/components/scan/CaptureFreezeFrame';
import { BarcodeScanLine } from '@/components/scan/BarcodeScanLine';
import { AnimatedCornerGuides } from '@/components/scan/AnimatedCornerGuides';
import { PulsingIcon } from '@/components/scan/PulsingIcon';
import { AnimatedModeTabs, type ScanMode } from '@/components/scan/AnimatedModeTabs';

const BARCODE_TYPES = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code39',
  'code93',
  'code128',
  'itf14',
] as const;

/** Web needs a secure context (localhost or https) before getUserMedia exists at all. */
function isCameraSupportedOnPlatform() {
  if (Platform.OS !== 'web') return true;
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export default function ScanScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const menuItems = useMenuStore((state) => state.items);
  const setCurrentResult = useScanStore((state) => state.setCurrentResult);
  const setCurrentPhoto = useScanStore((state) => state.setCurrentPhoto);
  const setCurrentMealPeriod = useScanStore((state) => state.setCurrentMealPeriod);

  const [flash, setFlash] = useState(false);
  const [mode, setMode] = useState<ScanMode>('scan');
  const [describeText, setDescribeText] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<FoodSearchResult | null>(null);

  // The frozen shot shown between the shutter press and the analysis result —
  // set the instant a photo is captured, cleared once handleCapture settles
  // (whether that ends in navigating to review or an error alert).
  const [capturedPreviewUri, setCapturedPreviewUri] = useState<string | null>(null);
  // One-shot green flash on the corner guides for a successful barcode read.
  const [barcodePulse, setBarcodePulse] = useState(false);

  const reducedMotion = useReducedMotion();

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // One automatic prompt per mount. Re-prompting in a loop is what makes a denied
  // permission look like a broken camera.
  const hasAutoRequested = useRef(false);

  const platformSupportsCamera = isCameraSupportedOnPlatform();
  const wantsCamera = mode === 'scan' || mode === 'barcode';
  const cameraActive =
    wantsCamera && isFocused && platformSupportsCamera && permission?.granted === true;

  useEffect(() => {
    if (!platformSupportsCamera) return;
    if (hasAutoRequested.current) return;
    if (permission?.status !== 'undetermined') return;

    hasAutoRequested.current = true;
    requestPermission();
  }, [permission?.status, platformSupportsCamera, requestPermission]);

  // The preview is torn down whenever we leave the screen or switch modes, so the
  // "ready" flag must not survive into the next mount.
  useEffect(() => {
    if (!cameraActive) setCameraReady(false);
  }, [cameraActive]);

  // Cross-fades the center content (viewfinder <-> describe form) on mode
  // change instead of an instant cut. Skipped under reduced motion.
  const contentOpacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) {
      contentOpacity.value = 1;
      return;
    }
    contentOpacity.value = 0;
    contentOpacity.value = withTiming(1, { duration: 150 });
  }, [mode, reducedMotion]);
  const contentFadeStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const handlePermissionPress = useCallback(async () => {
    // requestPermission() is a silent no-op once the user has denied for good — the
    // only way back is the system settings screen.
    if (permission && !permission.canAskAgain) {
      await Linking.openSettings();
      return;
    }
    await requestPermission();
  }, [permission, requestPermission]);

  // Time-of-day auto-detection
  const getAutoPeriod = (): 'breakfast' | 'lunch' | 'dinner' => {
    const hours = new Date().getHours();
    if (hours < 10.5) return 'breakfast';
    if (hours < 16) return 'lunch';
    return 'dinner';
  };

  const [mealPeriod, setMealPeriod] = useState<'breakfast' | 'lunch' | 'dinner'>(getAutoPeriod());
  const contextPill = `Dining Center · ${mealPeriod.charAt(0).toUpperCase() + mealPeriod.slice(1)}`;

  const handleCapture = async (imageBase64?: string, photoUri?: string) => {
    setIsScanning(true);
    try {
      const currentPeriodMenu = menuItems.filter((i) => i.meal_period === mealPeriod);

      const result = await analyzePlate({
        image_base64: imageBase64,
        describe_text: mode === 'describe' ? describeText : undefined,
        meal_period: mealPeriod,
        menu_items: currentPeriodMenu,
      });

      setCurrentPhoto(photoUri && imageBase64 ? { uri: photoUri, base64: imageBase64 } : null);
      setCurrentMealPeriod(mealPeriod);
      setCurrentResult(result);
      router.push('/scan/review' as any);
    } catch (err: any) {
      Alert.alert(
        'Analysis Error',
        err?.message || 'Could not analyze plate. You can search the menu directly.'
      );
    } finally {
      setIsScanning(false);
      // The freeze-frame's job is done either way: on success we're navigating
      // away, on failure the live camera should reappear so the user can retry.
      setCapturedPreviewUri(null);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || isScanning) return;
    if (!cameraReady) {
      Alert.alert('One moment', 'The camera is still starting up. Try again in a second.');
      return;
    }

    setIsScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('No image captured');

      const prepared = await prepareImageForAnalysis(photo.uri);
      setCapturedPreviewUri(prepared.uri);
      await handleCapture(prepared.base64, prepared.uri);
    } catch (err) {
      Alert.alert('Camera Error', 'Could not capture photo. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      if (!permissionResult.canAskAgain) {
        Alert.alert(
          'Photo Access Off',
          'Turn on photo access for SquirrelTrack in Settings to pick a meal photo.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      Alert.alert('Permission Required', 'Photo library access is required to choose a picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    try {
      const prepared = await prepareImageForAnalysis(result.assets[0].uri);
      await handleCapture(prepared.base64, prepared.uri);
    } catch {
      Alert.alert('Photo Error', 'Could not read that photo. Try a different one.');
    }
  };

  // Barcode hits go through the same portion/meal-period/log composer as DC
  // menu and OpenFoodFacts text search (FoodComposeSheet) instead of the
  // scan/review screen, which has no way to represent per-100g packaged
  // nutrition or capture micronutrients into the balance score.
  const resolveBarcode = useCallback(
    async (code: string) => {
      setIsScanning(true);
      try {
        const product = await lookupBarcode(code);
        if (!product) {
          Alert.alert(
            'Product Not Found',
            `No match for ${code} in OpenFoodFacts or USDA FoodData Central. You can add it manually instead.`,
            [
              { text: 'Try again', style: 'cancel' },
              { text: 'Add it manually', onPress: () => router.push('/log/quick-add' as any) },
            ]
          );
          return;
        }

        setBarcodeResult(barcodeProductToSearchResult(product));
      } catch {
        Alert.alert('Lookup Error', 'Unable to resolve barcode.');
      } finally {
        setIsScanning(false);
      }
    },
    [router]
  );

  // A single barcode fires dozens of frames per second; without a lock every one of
  // them starts its own lookup.
  const scanLock = useRef(false);

  const handleBarcodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (scanLock.current || isScanning) return;
      scanLock.current = true;

      setBarcodeInput(data);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      // A visual beat alongside the lookup, not gating it: the pulse plays out
      // on its own timer while resolveBarcode runs unblocked underneath it.
      setBarcodePulse(true);
      setTimeout(() => setBarcodePulse(false), 500);

      await resolveBarcode(data);
      setTimeout(() => {
        scanLock.current = false;
      }, 2000);
    },
    [isScanning, resolveBarcode]
  );

  const handleManualBarcode = () => {
    const code = barcodeInput.trim();
    if (!code) return;
    resolveBarcode(code);
  };

  const renderCameraBlocker = () => {
    if (!platformSupportsCamera) {
      return (
        <View style={styles.scanningOverlay}>
          <CameraOff size={28} color={Colors.gold} />
          <Text style={styles.blockerText}>
            The browser is blocking camera access. Open SquirrelTrack over https or on
            localhost, or use the app on your phone.
          </Text>
          <Button
            label="Choose a photo instead"
            variant="secondary"
            onPress={pickImage}
            style={{ marginTop: 14 }}
          />
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={styles.scanningOverlay}>
          <ActivityIndicator color={Colors.gold} />
          <Text style={styles.analyzingText}>Checking camera access…</Text>
        </View>
      );
    }

    if (!permission.granted) {
      const blockedForGood = !permission.canAskAgain;
      return (
        <View style={styles.scanningOverlay}>
          <CameraOff size={28} color={Colors.gold} />
          <Text style={styles.blockerText}>
            {blockedForGood
              ? 'Camera access is turned off for SquirrelTrack. Turn it on in Settings to scan your plate.'
              : 'SquirrelTrack needs your camera to scan your plate.'}
          </Text>
          <Button
            label={blockedForGood ? 'Open Settings' : 'Allow camera access'}
            variant="primary"
            onPress={handlePermissionPress}
            style={{ marginTop: 14 }}
          />
        </View>
      );
    }

    if (isScanning) {
      return (
        <View style={styles.scanningOverlay}>
          <PulsingIcon reducedMotion={reducedMotion}>
            <Sparkles size={32} color={Colors.gold} />
          </PulsingIcon>
          <Text style={styles.analyzingText}>
            {mode === 'barcode'
              ? 'Looking up this product…'
              : "Matching against today's DC menu..."}
          </Text>
        </View>
      );
    }

    if (!cameraReady) {
      return (
        <View style={styles.hintContainer}>
          <Text style={styles.frameHint}>Starting camera…</Text>
        </View>
      );
    }

    return (
      <View style={styles.hintContainer}>
        <Text style={styles.frameHint}>
          {mode === 'barcode'
            ? 'Point at the barcode on the package.'
            : 'Center your tray. Works for a full plate.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        {/* Top Controls Bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.circleBtn}
            accessibilityLabel="Close camera"
          >
            <X size={20} color={Colors.darkText} />
          </Pressable>

          <Pressable
            onPress={() => {
              const next =
                mealPeriod === 'breakfast'
                  ? 'lunch'
                  : mealPeriod === 'lunch'
                    ? 'dinner'
                    : 'breakfast';
              setMealPeriod(next);
            }}
            style={styles.contextPill}
          >
            <Text style={styles.contextText}>{contextPill}</Text>
            <ChevronDown size={14} color={Colors.darkText} style={{ marginLeft: 4 }} />
          </Pressable>

          {wantsCamera ? (
            <Pressable
              onPress={() => setFlash(!flash)}
              disabled={!cameraActive}
              style={[styles.circleBtn, !cameraActive && styles.circleBtnDisabled]}
              accessibilityLabel="Toggle flash"
            >
              {flash ? (
                <Zap size={20} color={Colors.gold} />
              ) : (
                <ZapOff size={20} color={Colors.darkText} />
              )}
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {/* Viewfinder Center */}
        <Animated.View style={[{ flex: 1 }, contentFadeStyle]}>
        {wantsCamera ? (
          <View style={styles.viewfinderCenter}>
            <View style={styles.frameGuide}>
              {cameraActive && (
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={flash}
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() =>
                    Alert.alert(
                      'Camera Error',
                      'The camera could not start. Close any other app using it and try again.'
                    )
                  }
                  barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                  onBarcodeScanned={mode === 'barcode' ? handleBarcodeScanned : undefined}
                />
              )}

              <CaptureFreezeFrame uri={capturedPreviewUri} analyzing={isScanning} />

              <AnimatedCornerGuides pulse={barcodePulse} />

              {mode === 'barcode' && cameraActive && cameraReady && !isScanning ? (
                <BarcodeScanLine reducedMotion={reducedMotion} />
              ) : null}

              {renderCameraBlocker()}
            </View>
          </View>
        ) : (
          <View style={styles.describeCenter}>
            <Text style={[Typography.title, { color: Colors.darkText, marginBottom: 12 }]}>
              Describe your plate
            </Text>
            <Text style={[Typography.bodyS, { color: Colors.darkTextDim, marginBottom: 16 }]}>
              We'll match your description against what's being served at the DC today.
            </Text>
            <TextInput
              placeholder="e.g. Chicken parm with pasta, corn and side salad"
              placeholderTextColor={Colors.darkTextDim}
              value={describeText}
              onChangeText={setDescribeText}
              multiline
              style={styles.describeInput}
            />
            <Button
              label="Find on menu"
              variant="primary"
              onPress={() => handleCapture()}
              loading={isScanning}
              style={{ marginTop: 16, width: '100%' }}
            />
          </View>
        )}
        </Animated.View>

        {/* Bottom Shutter & Mode Switcher */}
        <View style={styles.bottomSection}>
          <AnimatedModeTabs mode={mode} onChange={setMode} />

          {mode === 'scan' ? (
            <View style={styles.shutterRow}>
              <Pressable
                onPress={pickImage}
                style={styles.galleryBtn}
                accessibilityLabel="Choose from photo library"
              >
                <ImageIcon size={22} color={Colors.darkText} />
              </Pressable>

              <ShutterButton
                onPress={takePhoto}
                disabled={!cameraActive || !cameraReady || isScanning}
              />

              <View style={{ width: 44 }} />
            </View>
          ) : mode === 'barcode' ? (
            <View style={styles.barcodeFallback}>
              <View style={styles.barcodeLabelRow}>
                <Barcode size={14} color={Colors.darkTextDim} />
                <Text style={styles.barcodeLabel}>Label damaged? Enter the numbers</Text>
              </View>
              <View style={styles.barcodeInputRow}>
                <TextInput
                  placeholder="e.g. 04963406"
                  placeholderTextColor={Colors.darkTextDim}
                  value={barcodeInput}
                  onChangeText={setBarcodeInput}
                  keyboardType="numeric"
                  style={styles.barcodeInput}
                />
                <Button
                  label="Search"
                  variant="primary"
                  onPress={handleManualBarcode}
                  loading={isScanning}
                  style={{ height: 48, paddingHorizontal: 16 }}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <FoodComposeSheet
        result={barcodeResult}
        onClose={() => setBarcodeResult(null)}
        onLogged={() => {
          setBarcodeResult(null);
          router.back();
        }}
      />
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
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnDisabled: {
    opacity: 0.35,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.darkSurface,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radii.pill,
  },
  contextText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.darkText,
  },
  viewfinderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  frameGuide: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.darkSurface,
  },
  hintContainer: {
    backgroundColor: 'rgba(20, 20, 20, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radii.pill,
  },
  frameHint: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.darkText,
    textAlign: 'center',
  },
  scanningOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderRadius: 20,
    padding: 24,
    maxWidth: '90%',
  },
  analyzingText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.cream,
    marginTop: 12,
    textAlign: 'center',
  },
  blockerText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.cream,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  describeCenter: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  describeInput: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.darkSurface,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: Radii.card,
    padding: 16,
    fontSize: 15,
    fontFamily: Fonts.outfit.regular,
    color: Colors.darkText,
    textAlignVertical: 'top',
  },
  barcodeFallback: {
    width: '100%',
  },
  barcodeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  barcodeLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
    color: Colors.darkTextDim,
  },
  barcodeInputRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    alignItems: 'center',
  },
  barcodeInput: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.darkSurface,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: Radii.input,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: Fonts.outfit.regular,
    color: Colors.darkText,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  galleryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
