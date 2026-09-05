import React, { useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Slot, Redirect, usePathname, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  UtensilsCrossed,
  MessageSquare,
  Users,
  Bell,
  FileDown,
  Activity,
  ArrowUpRight,
  Leaf,
} from "lucide-react-native";
import { useAuthStore, selectIsAdmin } from "@/store/authStore";
import { Colors, Fonts, Typography } from "@/constants/theme";
import { AppIcon } from "@/components/ui/AppIcon";

const links = [
  ["/admin", "Overview", LayoutDashboard],
  ["/admin/dishes", "Meals & dishes", UtensilsCrossed],
  ["/admin/ratings", "Ratings & feedback", MessageSquare],
  ["/admin/users", "Students", Users],
  ["/admin/menu", "Menu management", Leaf],
  ["/admin/notifications", "Notifications", Bell],
  ["/admin/reports", "Reports & audit", FileDown],
  ["/admin/activity", "Platform activity", Activity],
] as const;
export default function AdminLayout() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const admin = useAuthStore(selectIsAdmin);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const client = useQueryClient();
  const path = usePathname();
  const router = useRouter();
  const wide = useWindowDimensions().width >= 1000;
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ["admin"] });
    },
    [client, user?.id],
  );
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!profile)
    return (
      <View style={{ padding: 40, gap: 20 }}>
        <ActivityIndicator color={Colors.scarlet} />
        <Text style={Typography.body}>Checking dashboard access…</Text>
        <Pressable onPress={() => void loadProfile(user.id)}>
          <Text style={Typography.body}>Retry</Text>
        </Pressable>
      </View>
    );
  if (!admin) return <Redirect href="/(tabs)/settings" />;
  return (
    <View style={[s.shell, !wide && { flexDirection: "column" }]}>
      <View
        style={[
          s.sidebar,
          !wide && {
            width: "100%",
            padding: 16,
            borderRightWidth: 0,
            borderBottomWidth: 1,
            borderBottomColor: Colors.borderSoft,
          },
        ]}
      >
        <View style={s.brand}>
          <AppIcon size={40} />
          <View>
            <Text style={s.brandName}>HaverTrack</Text>
            <Text style={s.eyebrow}>DINING INSIGHTS</Text>
          </View>
        </View>
        <ScrollView
          horizontal={!wide}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={
            !wide ? { gap: 8 } : { gap: 6, paddingTop: 24 }
          }
        >
          {links.map(([href, label, Icon]) => (
            <Pressable
              key={href}
              accessibilityRole="link"
              accessibilityState={{ selected: path === href }}
              onPress={() => router.push(href as never)}
              style={[s.nav, path === href && s.active]}
            >
              <Icon
                size={19}
                color={path === href ? Colors.scarlet : Colors.textMuted}
                strokeWidth={1.7}
              />
              <Text
                style={[s.navText, path === href && { color: Colors.scarlet }]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {wide && (
          <View style={s.sidebarBottom}>
            <Text style={Typography.bodySSemiBold}>
              {profile.full_name || "Administrator"}
            </Text>
            <Text style={s.muted}>{profile.email}</Text>
            <Pressable
              onPress={() => router.push("/(tabs)" as never)}
              style={s.nav}
            >
              <ArrowUpRight size={18} color={Colors.textMuted} />
              <Text style={s.navText}>Back to the app</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={s.content}>
        <Slot />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: Colors.cream },
  sidebar: {
    width: 246,
    padding: 22,
    borderRightWidth: 1,
    borderRightColor: Colors.borderSoft,
    backgroundColor: "#F5F0E8",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  brandName: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 22,
    color: Colors.ink,
    letterSpacing: -0.5,
  },
  eyebrow: {
    ...Typography.monoLabel,
    fontSize: 9,
    letterSpacing: 1.5,
    marginTop: 3,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 12,
    minHeight: 46,
  },
  navText: { ...Typography.bodyS, color: Colors.textMuted },
  active: { backgroundColor: "#EEDDDC" },
  sidebarBottom: {
    gap: 5,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  muted: { ...Typography.micro, color: Colors.textMuted },
  content: { flex: 1, minWidth: 0 },
});
