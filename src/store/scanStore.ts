import { create } from 'zustand';
import { AnalyzePlateResponse } from '@/lib/llm/types';

export interface CapturedPhoto {
  /** Local URI of the prepared (downscaled) capture. */
  uri: string;
  /** Same image as raw base64, reused for the Storage upload on save. */
  base64: string;
}

export type ScanMealPeriod = 'breakfast' | 'lunch' | 'dinner';

interface ScanState {
  currentResult: AnalyzePlateResponse | null;
  currentPhoto: CapturedPhoto | null;
  /** Meal period selected on the camera screen, carried into the review save. */
  currentMealPeriod: ScanMealPeriod;
  setCurrentResult: (res: AnalyzePlateResponse | null) => void;
  setCurrentPhoto: (photo: CapturedPhoto | null) => void;
  setCurrentMealPeriod: (period: ScanMealPeriod) => void;
  clear: () => void;
}

function periodForNow(): ScanMealPeriod {
  const hours = new Date().getHours();
  if (hours < 10) return 'breakfast';
  if (hours < 16) return 'lunch';
  return 'dinner';
}

export const useScanStore = create<ScanState>((set) => ({
  currentResult: null,
  currentPhoto: null,
  currentMealPeriod: periodForNow(),
  setCurrentResult: (currentResult) => set({ currentResult }),
  setCurrentPhoto: (currentPhoto) => set({ currentPhoto }),
  setCurrentMealPeriod: (currentMealPeriod) => set({ currentMealPeriod }),
  clear: () => set({ currentResult: null, currentPhoto: null }),
}));
