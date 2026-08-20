import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

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
type EditableProfile = Pick<
  UserProfile,
  'full_name' | 'class_year' | 'height_cm' | 'weight_kg' | 'age' | 'activity_level' | 'units'
>;

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  goal: DailyGoal | null;
  isLoading: boolean;
  isInitialized: boolean;
  /**
   * Set by the root layout when a web OAuth callback fails. Local component
   * state cannot carry this: web sign-in leaves the page entirely, so the
   * screen that owned the error had already been torn down and remounted by
   * the time Supabase answered. Without somewhere durable to put it, a failed
   * Google sign-in on web looked identical to no sign-in at all.
   */
  oauthError: string | null;

  setGoal: (goal: DailyGoal | null) => void;
  setOAuthError: (message: string | null) => void;
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
  oauthError: null,

  setGoal: (goal) => set({ goal }),

  setOAuthError: (message) => set({ oauthError: message }),

  loadProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Profile load failed:', error.message);
      return null;
    }

    // The signup trigger normally creates this row; if it is missing we create it
    // rather than running the app with a null profile.
    if (!data) {
      const { data: created, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: userId, email: get().user?.email ?? '' })
        .select()
        .single();

      if (insertError) {
        console.warn('Profile self-heal failed:', insertError.message);
        return null;
      }
      set({ profile: created as UserProfile });
      return created as UserProfile;
    }

    set({ profile: data as UserProfile });

    const { data: goalRow } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (goalRow) set({ goal: goalRow as DailyGoal });

    return data as UserProfile;
  },

  updateProfile: async (patch) => {
    const userId = get().user?.id;
    if (!userId) throw new Error('You need to be signed in to save your profile.');

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    set({ profile: data as UserProfile });
  },

  completeOnboarding: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.warn('Could not mark onboarding complete:', error.message);
      return;
    }
    set({ profile: data as UserProfile });
  },

  saveGoal: async (goal) => {
    set({ goal });

    const userId = get().user?.id;
    if (!userId) return;

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
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('Sign out error:', error.message);
    set({ user: null, session: null, profile: null, goal: DEFAULT_GOAL, oauthError: null });
  },

  /**
   * Restores a persisted session on launch and keeps the store in sync with
   * sign-in / sign-out / token refresh from anywhere in the app. Returns an
   * unsubscribe function.
   */
  initAuth: () => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        get().loadProfile(session.user.id);
      } else {
        set({ profile: null, goal: DEFAULT_GOAL });
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        set({ session, user: session?.user ?? null });
        if (session?.user) await get().loadProfile(session.user.id);
      })
      .catch((e) => console.warn('Session restore failed:', e))
      .finally(() => set({ isLoading: false, isInitialized: true }));

    return () => data.subscription.unsubscribe();
  },
}));

export const selectIsAdmin = (state: AuthState) => state.profile?.role === 'admin';
export const selectIsOnboarded = (state: AuthState) => !!state.profile?.onboarded_at;
