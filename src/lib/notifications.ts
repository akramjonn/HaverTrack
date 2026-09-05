/** Web has no Expo Go client; the native implementation supplies the real guard. */
export const isExpoGo = false;

export async function enableRatingNotifications() {
  return "Push reminders are available in the iOS and Android app. You can always rate meals from your history here.";
}
export async function removeRatingDevice() {}
export async function restoreRatingDevice() {}
