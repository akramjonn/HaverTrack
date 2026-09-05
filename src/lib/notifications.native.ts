import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const TOKEN_KEY = "@havertrack_rating_push_token";
/** Android remote notifications cannot even be imported in Expo Go on SDK 53+. */
export const isExpoGo = Constants.appOwnership === "expo";
type NotificationModule = typeof import("expo-notifications");

async function notificationModule(): Promise<NotificationModule | null> {
  if (isExpoGo) return null;
  return import("expo-notifications");
}

async function registerToken(notifications: NotificationModule) {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error("This build is missing its notification project configuration.");
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc("register_rating_device", {
    p_token: token,
    p_platform: Platform.OS,
  });
  if (error) throw new Error(error.message);
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function enableRatingNotifications() {
  const notifications = await notificationModule();
  if (!notifications)
    return "Push reminders need the HaverTrack development build. You can still rate recent meals in this Expo Go preview.";
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync("meal-ratings", {
      name: "Meal ratings",
      importance: notifications.AndroidImportance.DEFAULT,
    });
  const permission = await notifications.requestPermissionsAsync();
  if (!permission.granted)
    return "Notifications are off. Your recent meals will still have an in-app rating prompt.";
  await registerToken(notifications);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to enable reminders.");
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    enabled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return "Reminders enabled. We’ll check in about an hour after meals, outside your quiet hours.";
}

export async function restoreRatingDevice() {
  const notifications = await notificationModule();
  if (!notifications || !(await notifications.getPermissionsAsync()).granted) return;
  await registerToken(notifications);
}

export async function removeRatingDevice() {
  if (isExpoGo) return;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase.rpc("register_rating_device", {
    p_token: token,
    p_platform: Platform.OS,
    p_remove: true,
  });
  if (error)
    throw new Error("Could not disconnect reminders. Reconnect and try signing out again.");
  await AsyncStorage.removeItem(TOKEN_KEY);
}
