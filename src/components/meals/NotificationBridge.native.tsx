import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { isExpoGo, restoreRatingDevice } from "@/lib/notifications";
import { reminderAction } from "@/lib/ratings";

export function NotificationBridge() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const initialized = useAuthStore((s) => s.isInitialized);
  const [pending, setPending] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (isExpoGo) return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    void import("expo-notifications")
      .then((Notifications) => {
        if (!active) return;
        const receive = (
          response: import("expo-notifications").NotificationResponse | null,
        ) => {
          if (!response || handled.current === response.notification.request.identifier)
            return;
          const data = response.notification.request.content.data ?? {};
          if (
            data.kind !== "meal-rating" ||
            typeof data.mealId !== "string" ||
            !/^[a-f0-9-]{36}$/i.test(data.mealId)
          )
            return;
          handled.current = response.notification.request.identifier;
          setPending(data.mealId);
        };
        void Notifications.getLastNotificationResponseAsync()
          .then(receive)
          .catch(() => undefined);
        subscription = Notifications.addNotificationResponseReceivedListener(receive);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (userId) void restoreRatingDevice().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!initialized || !pending) return;
    if (!userId) {
      router.push("/(auth)/sign-in" as never);
      return;
    }
    const meal = pending;
    void reminderAction(meal, "opened")
      .then(() => {
        setPending(null);
        router.push({ pathname: "/rate", params: { meal } } as never);
      })
      .catch(() => setPending(null));
  }, [initialized, userId, pending, router]);

  return null;
}
