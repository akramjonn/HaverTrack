import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Colors, Radii } from '@/constants/theme';
import { IconButton } from '@/components/ui';

interface PhotoDetailSheetProps {
  /** Local capture uri OR a remote signed URL. Null renders a neutral placeholder. */
  photoUri: string | null;
  onBack: () => void;
  /** Rendered top-right, floating over the photo (e.g. share/overflow buttons). */
  headerActions?: React.ReactNode;
  /** Fraction of screen height the sheet occupies when collapsed. Default 0.42. */
  collapsedRatio?: number;
  /** Fixed action bar, rendered below the scrollable body. */
  footer: React.ReactNode;
  /** Scrollable sheet body. */
  children: React.ReactNode;
}

interface PhotoDetailSheetControls {
  /** Force the sheet to its expanded snap point — call from a child's onFocus. */
  expand: () => void;
}

const PhotoDetailSheetContext = createContext<PhotoDetailSheetControls | null>(null);

/** Lets sheet content (e.g. a title `TextInput`) force the sheet open on focus. */
export function usePhotoDetailSheetControls(): PhotoDetailSheetControls | null {
  return useContext(PhotoDetailSheetContext);
}

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

/**
 * Cal AI–style post-scan detail: a photo pinned full-bleed behind a white sheet
 * that snaps between two positions (collapsed / expanded) driven by the inner
 * ScrollView's own scroll events — deliberately not a pan gesture, since
 * react-native-gesture-handler isn't mounted anywhere in this app (see
 * scan/review.tsx and the plan notes for why that's staying that way).
 */
export function PhotoDetailSheet({
  photoUri,
  onBack,
  headerActions,
  collapsedRatio = 0.42,
  footer,
  children,
}: PhotoDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const collapsedTop = screenHeight * collapsedRatio;
  const expandedTop = insets.top + 12;

  const sheetTop = useSharedValue(collapsedTop);
  const [expanded, setExpanded] = useState(false);

  const animateTo = useCallback(
    (target: number, isExpanded: boolean) => {
      sheetTop.value = reducedMotion ? target : withSpring(target, SPRING_CONFIG);
      setExpanded(isExpanded);
    },
    [reducedMotion, sheetTop]
  );

  const expand = useCallback(() => {
    animateTo(expandedTop, true);
  }, [animateTo, expandedTop]);

  const collapse = useCallback(() => {
    animateTo(collapsedTop, false);
  }, [animateTo, collapsedTop]);

  const toggle = useCallback(() => {
    if (expanded) {
      collapse();
    } else {
      expand();
    }
  }, [expanded, collapse, expand]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (!expanded && y > 8) {
        animateTo(expandedTop, true);
      }
    },
    [expanded, animateTo, expandedTop]
  );

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (expanded && y < -40) {
        collapse();
      }
    },
    [expanded, collapse]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    top: sheetTop.value,
  }));

  const controls: PhotoDetailSheetControls = { expand };

  return (
    <View style={StyleSheet.absoluteFill}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.photoPlaceholder]} />
      )}

      <View style={[styles.backWrap, { top: insets.top + 12 }]}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.cream} />}
          onPress={onBack}
          variant="dark"
          shape="circle"
          accessibilityLabel="Back"
        />
      </View>

      {headerActions ? (
        <View style={[styles.actionsWrap, { top: insets.top + 12 }]}>{headerActions}</View>
      ) : null}

      <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kbAvoid}
        >
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse details' : 'Expand details'}
            style={styles.handleWrap}
            hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
          >
            <View style={styles.handle} />
          </Pressable>

          <PhotoDetailSheetContext.Provider value={controls}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScroll={handleScroll}
              onScrollEndDrag={handleScrollEndDrag}
              scrollEventThrottle={16}
            >
              {children}
            </ScrollView>
          </PhotoDetailSheetContext.Provider>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            {footer}
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoPlaceholder: {
    backgroundColor: Colors.darkBg,
  },
  backWrap: {
    position: 'absolute',
    left: 16,
  },
  actionsWrap: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 8,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.cardLg,
    borderTopRightRadius: Radii.cardLg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 10,
  },
  kbAvoid: {
    flex: 1,
  },
  handleWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.track3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    backgroundColor: Colors.surface,
  },
});
