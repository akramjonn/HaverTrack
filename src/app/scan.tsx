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
import { lookupBarcode } from '@/lib/openFoodFacts';
import { prepareImageForAnalysis } from '@/lib/image';
import { useMenuStore } from '@/store/menuStore';
import { useScanStore } from '@/store/scanStore';

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
  const [mode, setMode] = useState<'scan' | 'describe' | 'barcode'>('scan');
  const [describeText, setDescribeText] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

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

  const resolveBarcode = useCallback(
    async (code: string) => {
      setIsScanning(true);
      try {
        const product = await lookupBarcode(code);
        if (!product) {
          Alert.alert(
            'Product Not Found',
            `No match for ${code} in the OpenFoodFacts database. You can describe it instead.`
          );
          return;
        }

        setCurrentPhoto(null);
        setCurrentResult({
          dish_title: product.name,
          dish_subtitle: product.brand ? `Packaged · ${product.brand}` : 'Packaged Snack',
          matched_station: 'Coop / Packaged',
          match_confidence: 1.0,
          items: [
            {
              id: 'barcode-item',
              name: product.name,
              portion: 1.0,
              portion_unit: product.serving_size || 'package',
              is_menu_match: true,
              confidence_score: 1.0,
              calories: product.calories,
              protein_g: product.protein_g,
              carbs_g: product.carbs_g,
              fat_g: product.fat_g,
            },
          ],
          total_calories: product.calories,
          total_protein_g: product.protein_g,
          total_carbs_g: product.carbs_g,
          total_fat_g: product.fat_g,
          is_fallback_estimate: false,
        });

        router.push('/scan/review' as any);
      } catch {
        Alert.alert('Lookup Error', 'Unable to resolve barcode.');
      } finally {
        setIsScanning(false);
      }
    },
    [router, setCurrentPhoto, setCurrentResult]
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
          <Sparkles size={32} color={Colors.gold} />
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

              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />

              {mode === 'barcode' && cameraActive && cameraReady && !isScanning ? (
                <View style={styles.scanLine} />
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

        {/* Bottom Shutter & Mode Switcher */}
        <View style={styles.bottomSection}>
          {/* Mode Switcher */}
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setMode('scan')}
              style={[styles.modeItem, mode === 'scan' && styles.activeMode]}
            >
              <Text style={[styles.modeText, mode === 'scan' && styles.activeModeText]}>
                Scan food
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMode('describe')}
              style={[styles.modeItem, mode === 'describe' && styles.activeMode]}
            >
              <Text style={[styles.modeText, mode === 'describe' && styles.activeModeText]}>
                Describe it
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setMode('barcode')}
              style={[styles.modeItem, mode === 'barcode' && styles.activeMode]}
            >
              <Text style={[styles.modeText, mode === 'barcode' && styles.activeModeText]}>
                Barcode
              </Text>
            </Pressable>
          </View>

          {mode === 'scan' ? (
            <View style={styles.shutterRow}>
              <Pressable
                onPress={pickImage}
                style={styles.galleryBtn}
                accessibilityLabel="Choose from photo library"
              >
                <ImageIcon size={22} color={Colors.darkText} />
              </Pressable>

              <Pressable
                onPress={takePhoto}
                disabled={!cameraActive || !cameraReady || isScanning}
                style={[
                  styles.shutterOuter,
                  (!cameraActive || !cameraReady || isScanning) && styles.shutterDisabled,
                ]}
                accessibilityLabel="Take food photo"
              >
                <View style={styles.shutterInner} />
              </Pressable>

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
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: 'rgba(251, 248, 243, 0.6)',
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  scanLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 2,
    backgroundColor: Colors.scarletBright,
    opacity: 0.85,
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
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  modeItem: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  activeMode: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.scarlet,
  },
  modeText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.darkTextDim,
  },
  activeModeText: {
    color: Colors.darkText,
    fontFamily: Fonts.outfit.semiBold,
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
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.cream,
  },
});
