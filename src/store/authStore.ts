import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isCollegeEmail } from '@/lib/authErrors';
import { removeRatingDevice } from '@/lib/notifications';
import { operationalErrorCode, trackOperationalEvent } from '@/lib/observability';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  id: string;
  email: string;
  college_verified: boolean;
  college_email?: string | null;
  full_name?: string | null;
  class_year?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  age?: number | null;
  activity_level?: 'sedentary' | 'moderate' | 'active' | null;
  /** Self-reported, optional — improves the BMR offset in calculateGoals(); unset = neutral. */
  sex?: 'male' | 'female' | 'unspecified' | null;
  units: 'imperial' | 'metric';
  role: 'user' | 'admin';
  onboarded_at?: string | null;
  created_at?: string | null;
}

export interface DailyGoal {
  id?: string;
  goal_type: 'lose' | 'maintain' | 'gain' | 'tracking';
  calorie_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

/** Columns the client is allowed to write. Email, role and verification are server-owned. */
export type EditableProfile = Pick<
  UserProfile,
  'full_name' | 'class_year' | 'height_cm' | 'weight_kg' | 'age' | 'activity_level' | 'sex' | 'units'
>;

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  goal: DailyGoal | null;
  isLoading: boolean;
  isInitialized: boolean;
  /** Changes on every identity transition, including A → signed out → A. */
  accountRevision: number;

  setGoal: (goal: DailyGoal | null) => void;
  loadProfile: (userId: string) => Promise<UserProfile | null>;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  saveGoal: (goal: DailyGoal) => Promise<void>;
  signOut: () => Promise<void>;
  initAuth: () => () => void;
}

const DEFAULT_GOAL: DailyGoal = {
  goal_type: 'lose',
  calorie_target: 2340,
  protein_g: 140,
  carbs_g: 265,
  fat_g: 72,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  goal: DEFAULT_GOAL,
  isLoading: true,
  isInitialized: false,
  accountRevision: 0,

  setGoal: (goal) => set({ goal }),

  loadProfile: async (userId) => {
    const scope = captureAccountScope();
    if (scope.userId !== userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Profile load failed:', error.message);
      return null;
    }

    // Profiles and verification fields are created by the auth trigger only.
    if (!data) {
      console.warn('Profile is missing. Contact support to restore it.');
      return null;
    }

    if (!isAccountScopeCurrent(scope)) return null;
    set({ profile: data as UserProfile });

    const { data: goalRow } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (goalRow && isAccountScopeCurrent(scope)) set({ goal: goalRow as DailyGoal });

    return data as UserProfile;
  },

  updateProfile: async (patch) => {
    const scope = requireAccountScope();
    const userId = get().user?.id;
    if (!userId) throw new Error('You need to be signed in to save your profile.');

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (isAccountScopeCurrent(scope)) set({ profile: data as UserProfile });
  },

  completeOnboarding: async () => {
    const scope = requireAccountScope();
    const userId = get().user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (isAccountScopeCurrent(scope)) set({ profile: data as UserProfile });
  },

  saveGoal: async (goal) => {
    const scope = requireAccountScope();
    const userId = get().user?.id;
    if (!userId) throw new Error('You need to be signed in to save your goals.');

    const { error } = await supabase.from('daily_goals').upsert(
      {
        user_id: userId,
        goal_type: goal.goal_type,
        calorie_target: goal.calorie_target,
        protein_g: goal.protein_g,
        carbs_g: goal.carbs_g,
        fat_g: goal.fat_g,
        effective_from: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'user_id,effective_from' }
    );

    if (error) throw new Error(error.message);
    if (isAccountScopeCurrent(scope)) set({ goal });
  },

  signOut: async () => {
    const departingUser = get().user?.id;
    // Remove local authority before asynchronous device/network cleanup. The
    // Supabase session stays live for the cleanup RPC, so a token refresh for
    // the departing user must not sign them back in meanwhile.
    signingOutUserId = departingUser ?? null;
    applySession(null);
    const signedOutRevision = get().accountRevision;
    try {
      try {
        await removeRatingDevice();
      } catch (error) {
        console.warn('Could not unregister rating reminders during sign out:', error);
      }
      try {
        if (departingUser) await AsyncStorage.removeItem(`@havertrack_meal_draft:${departingUser}`);
      } catch (error) {
        console.warn('Could not remove the local meal draft during sign out:', error);
      }
    } finally {
      signingOutUserId = null;
    }
    // A later login must not be signed out by this old cleanup operation.
    if (get().accountRevision !== signedOutRevision) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      trackOperationalEvent('sign_out_failed', { code: operationalErrorCode(error) });
      throw new Error(error.message);
    }
    trackOperationalEvent('sign_out_completed');
  },

  /**
   * Restores a persisted session on launch and keeps the store in sync with
   * sign-in / sign-out / token refresh from anywhere in the app. Returns an
   * unsubscribe function.
   */
  initAuth: () => {
    const eligibleSession = (session: Session | null) => {
      if (!session) return null;
      return isCollegeEmail(session.user.email ?? '') && session.user.email_confirmed_at ? session : null;
    };
    let active = true;
    let authEvents = 0;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (signingOutUserId && session?.user.id === signingOutUserId) return;
      authEvents++;
      const eligible = eligibleSession(session);
      applySession(eligible);

      if (eligible?.user) {
        // Do not call Supabase from inside its auth lock.
        setTimeout(() => { void get().loadProfile(eligible.user.id); }, 0);
      } else {
        set({ profile: null, goal: DEFAULT_GOAL });
      }
    });

    const restoreRevision = get().accountRevision;
    const restoreEvents = authEvents;
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!active || authEvents !== restoreEvents || get().accountRevision !== restoreRevision) return;
        const eligible = eligibleSession(session);
        applySession(eligible);
        if (eligible?.user) await get().loadProfile(eligible.user.id);
      })
      .catch((e) => console.warn('Session restore failed:', e))
      .finally(() => { if (active) set({ isLoading: false, isInitialized: true }); });

    return () => { active = false; data.subscription.unsubscribe(); };
  },
}));

let signingOutUserId: string | null = null;

export interface AccountScope {
  userId: string | null;
  revision: number;
}

export function captureAccountScope(): AccountScope {
  const state = useAuthStore.getState();
  return { userId: state.user?.id ?? null, revision: state.accountRevision };
}

export function isAccountScopeCurrent(scope: AccountScope): boolean {
  const current = captureAccountScope();
  return scope.userId === current.userId && scope.revision === current.revision;
}

export function requireAccountScope(expectedUserId?: string | null): AccountScope & { userId: string } {
  const scope = captureAccountScope();
  if (!scope.userId || (expectedUserId !== undefined && expectedUserId !== scope.userId)) {
    throw new Error('Your account changed. Please reopen this screen.');
  }
  return scope as AccountScope & { userId: string };
}

function applySession(session: Session | null) {
  const current = useAuthStore.getState();
  const userId = session?.user.id ?? null;
  const changed = userId !== (current.user?.id ?? null);
  useAuthStore.setState({
    session, user: session?.user ?? null,
    ...(changed ? { accountRevision: current.accountRevision + 1, profile: null, goal: DEFAULT_GOAL } : {}),
  });
}

export const selectIsAdmin = (state: AuthState) => state.profile?.role === 'admin';
export const selectIsOnboarded = (state: AuthState) => !!state.profile?.onboarded_at;
