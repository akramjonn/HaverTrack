import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

export interface StepCountState {
  /** null means "unavailable" (no hardware, or permission denied) — 0 is a real reading, not the same thing. */
  steps: number | null;
  available: boolean;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Live step count for today.
 *
 * Platform asymmetry is real and not papered over here:
 * - iOS: `getStepCountAsync` gives a genuine "steps today" total (CoreMotion persists up to
 *   7 days of history). `watchStepCount`'s callback reports steps counted cumulatively since
 *   the watch subscription started (not a per-tick delta), so live updates are folded in as
 *   `baseline (fetched before the watch started) + watchEvent.steps` — no repeated re-fetching
 *   of `getStepCountAsync` needed.
 * - Android: `getStepCountAsync` throws (native module has no date-range query on this
 *   platform at all). `watchStepCount` is the only source, and its `steps` value is already
 *   cumulative since the subscription began — so it's a "steps this session" number, not a
 *   real daily total. It's surfaced honestly as such by the consuming UI.
 */
export function useStepCount(): StepCountState {
  const [steps, setSteps] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  // iOS only: steps counted today before the live watch subscription started.
  const baselineRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let subscription: { remove: () => void } | null = null;

    (async () => {
      const isAvailable = await Pedometer.isAvailableAsync().catch(() => false);
      if (!mounted) return;
      if (!isAvailable) {
        setAvailable(false);
        setSteps(null);
        return;
      }

      let permission = await Pedometer.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Pedometer.requestPermissionsAsync();
      }
      if (!mounted) return;
      if (!permission.granted) {
        setAvailable(false);
        setSteps(null);
        return;
      }

      setAvailable(true);

      if (Platform.OS === 'ios') {
        try {
          const result = await Pedometer.getStepCountAsync(startOfToday(), new Date());
          if (!mounted) return;
          baselineRef.current = result.steps;
          setSteps(result.steps);
        } catch {
          // iOS Simulator (no hardware) or a query error — fall back to 0 and let the
          // live watch subscription below take over from there.
          if (!mounted) return;
          baselineRef.current = 0;
          setSteps(0);
        }

        subscription = Pedometer.watchStepCount((result) => {
          if (!mounted) return;
          setSteps(baselineRef.current + result.steps);
        });
      } else {
        // Android: no historical query available — the watch's cumulative-since-subscribed
        // count IS the number, starting at 0 the moment we start listening.
        setSteps(0);
        subscription = Pedometer.watchStepCount((result) => {
          if (!mounted) return;
          setSteps(result.steps);
        });
      }
    })();

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return { steps, available };
}
