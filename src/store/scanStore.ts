import { create } from 'zustand';
import { AnalyzePlateResponse } from '@/lib/llm/types';
import { useAuthStore, AccountScope, isAccountScopeCurrent } from '@/store/authStore';

export interface CapturedPhoto {
  /** Local URI of the prepared (downscaled) capture. */
  uri: string;
  /** Same image as raw base64, reused for the Storage upload on save. */
  base64: string;
}

export type ScanMealPeriod = 'breakfast' | 'lunch' | 'dinner';

interface ScanState {
  owner: AccountScope | null;
  currentResult: AnalyzePlateResponse | null;
  currentPhoto: CapturedPhoto | null;
  /** Meal period selected on the camera screen, carried into the review save. */
  currentMealPeriod: ScanMealPeriod;
  setScan: (owner: AccountScope, result: AnalyzePlateResponse, photo: CapturedPhoto | null, period: ScanMealPeriod) => boolean;
  clear: () => void;
}

function periodForNow(): ScanMealPeriod {
  const hours = new Date().getHours();
  if (hours < 10) return 'breakfast';
  if (hours < 16) return 'lunch';
  return 'dinner';
}

export const useScanStore = create<ScanState>((set) => ({
  owner: null,
  currentResult: null,
  currentPhoto: null,
  currentMealPeriod: periodForNow(),
  setScan: (owner, currentResult, currentPhoto, currentMealPeriod) => {
    if (!owner.userId || !isAccountScopeCurrent(owner)) return false;
    set({ owner, currentResult, currentPhoto, currentMealPeriod });
    return true;
  },
  clear: () => set({ owner: null, currentResult: null, currentPhoto: null, currentMealPeriod: periodForNow() }),
}));

useAuthStore.subscribe((state, previous) => {
  if (state.accountRevision !== previous.accountRevision) useScanStore.getState().clear();
});
