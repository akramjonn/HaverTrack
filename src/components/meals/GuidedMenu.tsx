import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  Info,
  Minus,
  Plus,
  Search,
  X,
  Bell,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Colors, Fonts, Typography } from "@/constants/theme";
import { Button } from "@/components/ui";
import { FoodIcon } from "@/components/ui/FoodIcon";
import { Enter, MotionPressable } from "@/components/ui/Motion";
import {
  COURSES,
  COURSE_LABELS,
  classifyDish,
  campusPeriod,
  servingKey,
  uuid,
} from "@/lib/mealFlow";
import { useMenuStore } from "@/store/menuStore";
import { useAuthStore } from "@/store/authStore";
import { getTodayString } from "@/store/logStore";
import { logMeal } from "@/lib/logging";
import type { ParsedMenuItem } from "@/lib/nutrislice";
import { trackMealEvent } from "@/lib/ratings";
import { enableRatingNotifications } from "@/lib/notifications";

type Draft = {
  day: string;
  period: ParsedMenuItem["meal_period"];
  main: string | null;
  quantities: Record<string, number>;
  journey: string;
};
const freshDraft = (): Draft => ({
  day: getTodayString(),
  period: campusPeriod(),
  main: null,
  quantities: {},
  journey: uuid(),
});
const labels = {
  breakfast: "Breakfast",
  brunch: "Brunch",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default function GuidedMenu(props: { previewItems?: ParsedMenuItem[] }) {
  const userId = useAuthStore((s) => s.user?.id);
  return <GuidedMenuSession key={userId ?? "signed-out"} {...props} />;
}

function GuidedMenuSession({
  previewItems,
}: {
  previewItems?: ParsedMenuItem[];
}) {
  const router = useRouter();
  const store = useMenuStore();
  const userId = useAuthStore((s) => s.user?.id);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [detail, setDetail] = useState<ParsedMenuItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    id: string | null;
    local: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cacheKey = `@havertrack_meal_draft:${userId ?? "preview"}`;
  const allItems = previewItems ?? store.items;
  const today = getTodayString();
  const periods = (
    Object.keys(labels) as ParsedMenuItem["meal_period"][]
  ).filter((p) =>
    allItems.some((i) => i.served_date === today && i.meal_period === p),
  );

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(cacheKey)
      .then((value) => {
        if (!active) return;
        if (value && !previewItems) {
          try {
            const d = JSON.parse(value);
            if (d.day === today && d.quantities && d.journey) {
              setDraft(d);
              return;
            }
          } catch {
            /* Discard malformed drafts. */
          }
        }
        setDraft(freshDraft());
      })
      .catch(() => {
        if (active) setDraft(freshDraft());
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [cacheKey, today, previewItems]);
  useEffect(() => {
    if (ready && !previewItems)
      void AsyncStorage.setItem(cacheKey, JSON.stringify(draft)).catch(
        () => undefined,
      );
  }, [cacheKey, draft, ready, previewItems]);
  const periodKey = periods.join(",");
  useEffect(() => {
    if (ready && !previewItems)
      void trackMealEvent("menu_viewed", draft.journey);
  }, [ready, previewItems, draft.journey]);
  // Align a restored draft with the asynchronous published service list.
  useEffect(() => {
    if (
      ready &&
      periodKey &&
      !periodKey.split(",").includes(draft.period) &&
      !Object.keys(draft.quantities).length
    )
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A published service can arrive after the local draft.
      setDraft((d) => ({
        ...d,
        period: periodKey.split(",")[0] as Draft["period"],
      }));
  }, [ready, periodKey, draft.period, draft.quantities]);

  const items = useMemo(() => {
    const unique = new Map<string, ParsedMenuItem>();
    for (const item of allItems)
      if (
        item.served_date === today &&
        item.meal_period === draft.period &&
        item.location_id === "dining-location"
      )
        unique.set(servingKey(item), item);
    return [...unique.values()];
  }, [allItems, today, draft.period]);
  const selected = items.filter((i) => draft.quantities[servingKey(i)] > 0);
  const main = items.find((i) => servingKey(i) === draft.main);
  const partial = selected.some((i) =>
    [i.calories, i.protein_g, i.carbs_g, i.fat_g].some((n) => n == null),
  );
  const calories = selected.reduce(
    (sum, i) => sum + (i.calories ?? 0) * draft.quantities[servingKey(i)],
    0,
  );
  const protein = selected.reduce(
    (sum, i) => sum + (i.protein_g ?? 0) * draft.quantities[servingKey(i)],
    0,
  );
  const missingSelection = Object.keys(draft.quantities).some(
    (k) =>
      draft.quantities[k] > 0 &&
      !items.some(
        (i) => servingKey(i) === k && i.availability !== "unavailable",
      ),
  );
  const shown = items.filter(
    (i) =>
      i.availability !== "unavailable" &&
      i.dish_name.toLowerCase().includes(search.toLowerCase()) &&
      (!tag ||
        i.dietary_tags.includes(tag) ||
        (tag === "High protein" && (i.protein_g ?? 0) >= 20)),
  );
  const mains = shown.filter((i) => classifyDish(i).course === "main");
  const event = (name: Parameters<typeof trackMealEvent>[0]) => {
    if (!previewItems) void trackMealEvent(name, draft.journey);
  };
  const haptic = () => {
    if (Platform.OS !== "web") void Haptics.selectionAsync();
  };
  const changeStep = (next: number) => {
    setStep(next);
    setSearch("");
    setError(null);
    haptic();
  };

  function choose(item: ParsedMenuItem) {
    const key = servingKey(item);
    if (!Object.keys(draft.quantities).length) event("meal_flow_started");
    event(step === 0 ? "main_selected" : "extra_added");
    setDraft((d) => {
      const quantities = { ...d.quantities };
      if (step === 0) {
        if (d.main && d.main !== key) delete quantities[d.main];
        quantities[key] = quantities[key] || 1;
      } else if (quantities[key]) delete quantities[key];
      else quantities[key] = 1;
      return { ...d, quantities, main: step === 0 ? key : d.main };
    });
    haptic();
  }
  function portion(item: ParsedMenuItem, delta: number) {
    setDraft((d) => ({
      ...d,
      quantities: {
        ...d.quantities,
        [servingKey(item)]: Math.min(
          10,
          Math.max(0.5, (d.quantities[servingKey(item)] || 1) + delta),
        ),
      },
    }));
  }
  async function confirm() {
    if (busy.current || !selected.length) return;
    if (missingSelection || draft.day !== today) {
      setError("The menu changed. Please review your choices again.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      if (previewItems) {
        setSaved({ id: null, local: false });
        return;
      }
      const result = await logMeal({
        title: main?.dish_name ?? "My dining hall meal",
        source: "menu",
        guided: true,
        journey_id: draft.journey,
        meal_period: draft.period === "brunch" ? "breakfast" : draft.period,
        items: selected.map((i) => {
          const amount = draft.quantities[servingKey(i)];
          return {
            id: servingKey(i),
            menu_item_id: i.id,
            nutrislice_id: i.nutrislice_id,
            location_id: i.location_id,
            station_name: i.station_name,
            course: classifyDish(i).course,
            name: i.dish_name,
            portion: amount,
            portion_unit: "serving",
            calories: (i.calories ?? 0) * amount,
            protein_g: (i.protein_g ?? 0) * amount,
            carbs_g: (i.carbs_g ?? 0) * amount,
            fat_g: (i.fat_g ?? 0) * amount,
            nutrition_complete: [
              i.calories,
              i.protein_g,
              i.carbs_g,
              i.fat_g,
            ].every((n) => n != null),
          };
        }),
      });
      setSaved({
        id: result.mealLogId,
        local: !!result.mealLogId?.startsWith("local-"),
      });
      setDraft(freshDraft());
      await AsyncStorage.removeItem(cacheKey);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your meal. Try again.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function foodCard(item: ParsedMenuItem) {
    const key = servingKey(item);
    const checked = !!draft.quantities[key];
    return (
      <View key={key} style={[s.foodCard, checked && s.selected]}>
        <MotionPressable
          onPress={() => choose(item)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Select ${item.dish_name}`}
          style={s.foodBody}
        >
          <FoodIcon
            course={classifyDish(item).course}
            tile
            size={step ? 22 : 26}
          />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={s.foodName}>{item.dish_name}</Text>
            <Text style={s.muted}>{item.station_name}</Text>
            <Text style={s.nutrition}>
              {item.calories == null
                ? "Nutrition pending"
                : `${item.calories} cal`}
              {item.protein_g != null ? `  ·  ${item.protein_g}g protein` : ""}
            </Text>
            {!!item.dietary_tags.length && (
              <Text style={s.diet}>
                {item.dietary_tags.slice(0, 2).join(" · ")}
              </Text>
            )}
          </View>
          <View
            style={[
              s.check,
              checked && {
                backgroundColor: Colors.scarlet,
                borderColor: Colors.scarlet,
              },
            ]}
          >
            {checked ? (
              <Check size={16} color="white" />
            ) : (
              <Plus size={16} color={Colors.textMuted} />
            )}
          </View>
        </MotionPressable>
        <View style={s.cardFoot}>
          <Text style={[s.muted, { flex: 1 }]}>
            {item.serving_size || "1 serving"}
            {item.availability === "unknown"
              ? " · Unverified availability"
              : ""}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Details for ${item.dish_name}`}
            onPress={() => setDetail(item)}
            style={s.detailButton}
          >
            <Info size={15} color={Colors.textMuted} />
            <Text style={s.link}>Details</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (saved)
    return (
      <SafeAreaView style={s.safe}>
        <Enter style={s.success}>
          <View style={s.successIcon}>
            <CheckCheck size={40} color={Colors.scarlet} />
          </View>
          <Text style={s.title}>Enjoy every bite.</Text>
          <Text style={s.subtitle}>
            {previewItems
              ? "Design preview · no meal was saved."
              : saved.local
                ? "Saved on this device. Your meal will sync when you’re back online."
                : "Your meal is saved. Your day is up to date."}
          </Text>
          <View style={s.mainSummary}>
            <Bell color={Colors.scarlet} size={22} />
            <Text style={[s.muted, { flex: 1 }]}>
              A little feedback goes a long way. Enable a reminder to rate your
              meal in about an hour.
            </Text>
          </View>
          {!previewItems && (
            <Button
              label="Enable rating reminders"
              onPress={() => {
                void enableRatingNotifications()
                  .then(setNotice)
                  .catch((e) => setNotice(e.message));
              }}
            />
          )}
          {!!notice && (
            <Text accessibilityLiveRegion="polite" style={s.muted}>
              {notice}
            </Text>
          )}
          {!saved.local && saved.id && (
            <Button
              label="Already eaten? Rate now"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/rate",
                  params: { meal: saved.id! },
                } as never)
              }
            />
          )}
          <Button
            label="Back to menu"
            variant="ghost"
            onPress={() => {
              setSaved(null);
              setDraft(freshDraft());
              setStep(0);
            }}
          />
        </Enter>
      </SafeAreaView>
    );

  return (
    <SafeAreaView edges={["top"]} style={s.safe}>
      <ScrollView
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.topline}>
          <Text style={s.eyebrow}>THE DINING ROOM</Text>
          <View style={s.inline}>
            <Clock3 size={13} color={Colors.textMuted} />
            <Text style={s.muted}>Today · Haverford DC</Text>
          </View>
        </View>
        <View>
          <Text style={s.title}>
            {
              [
                "Start with your main.",
                "Make it your meal.",
                "Your plate, ready.",
              ][step]
            }
          </Text>
          <Text style={s.subtitle}>
            {
              [
                "A good meal starts with something you love.",
                "A little on the side. Something sweet. Your choice.",
                "One last look before you dig in.",
              ][step]
            }
          </Text>
        </View>
        <View style={s.steps}>
          {["Main", "Extras", "Review"].map((label, i) => (
            <View key={label} style={s.step}>
              <View
                style={[
                  s.stepDot,
                  i <= step && { backgroundColor: Colors.scarlet },
                ]}
              >
                {i < step ? (
                  <Check size={12} color="white" />
                ) : (
                  <Text style={[s.muted, i <= step && { color: "white" }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text style={[s.muted, i === step && { color: Colors.ink }]}>
                {label}
              </Text>
              {i < 2 && <View style={s.stepLine} />}
            </View>
          ))}
        </View>
        {step === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.inline}
          >
            {(periods.length
              ? periods
              : (Object.keys(labels) as Draft["period"][])
            ).map((p) => (
              <Pressable
                key={p}
                accessibilityRole="tab"
                accessibilityState={{ selected: draft.period === p }}
                onPress={() => {
                  if (draft.period !== p) {
                    if (selected.length)
                      setNotice(
                        "Service changed. Choose your meal from this menu.",
                      );
                    setDraft({ ...freshDraft(), period: p });
                    setTag(null);
                  }
                }}
                style={[
                  s.period,
                  p === draft.period && { backgroundColor: Colors.ink },
                ]}
              >
                <Text
                  style={[
                    s.periodText,
                    p === draft.period && { color: "white" },
                  ]}
                >
                  {labels[p]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {!previewItems && (store.isStale || store.refreshError) && (
          <View style={s.warning}>
            <Text style={[s.muted, { flex: 1 }]}>
              Menu freshness could not be verified. Published dishes may have
              changed.
            </Text>
            <Pressable
              onPress={() => void store.refreshMenu()}
              style={s.detailButton}
            >
              <Text style={s.link}>
                {store.isRefreshing ? "Refreshing…" : "Refresh"}
              </Text>
            </Pressable>
          </View>
        )}
        {!!notice && (
          <Text accessibilityLiveRegion="polite" style={s.muted}>
            {notice}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {step < 2 && (
          <>
            <View style={s.searchRow}>
              <Search size={19} color={Colors.textMuted} />
              <TextInput
                accessibilityLabel="Search dishes"
                placeholder={
                  step ? "Find something to add…" : "Find your main…"
                }
                value={search}
                onChangeText={setSearch}
                style={s.search}
                placeholderTextColor={Colors.textFaint}
              />
            </View>
            <View style={s.filters}>
              {["Vegan", "Vegetarian", "High protein"].map((t) => (
                <Pressable
                  key={t}
                  accessibilityState={{ selected: tag === t }}
                  onPress={() => setTag(tag === t ? null : t)}
                  style={[s.filter, tag === t && s.selected]}
                >
                  <Text style={s.link}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Enter key={step} style={{ gap: 14 }}>
          {step === 0 && (
            <>
              <View style={s.between}>
                <Text style={s.sectionTitle}>On the menu</Text>
                <Text style={s.muted}>{mains.length} main dishes</Text>
              </View>
              {mains.map(foodCard)}
              {!mains.length && (
                <View style={s.empty}>
                  <FoodIcon course="main" tile size={30} />
                  <Text style={s.sectionTitle}>
                    {items.length
                      ? "No matching mains"
                      : "The menu is taking a moment."}
                  </Text>
                  <Text style={s.muted}>
                    {items.length
                      ? "Try another filter, or build a meal from the other published dishes."
                      : "Try another service or refresh the menu."}
                  </Text>
                </View>
              )}
              {!!items.length && (
                <Pressable
                  style={s.secondaryLink}
                  onPress={() => {
                    event("meal_flow_started");
                    changeStep(1);
                  }}
                >
                  <Text style={s.link}>Build a meal without a main</Text>
                  <ArrowRight size={16} color={Colors.scarlet} />
                </Pressable>
              )}
              <Button
                label="Suggest a plate for my goals"
                variant="ghost"
                onPress={() => router.push("/log/plate" as never)}
              />
            </>
          )}
          {step === 1 && (
            <>
              {main && (
                <View style={s.mainSummary}>
                  <FoodIcon course="main" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.eyebrow}>YOUR MAIN</Text>
                    <Text style={s.sectionTitle}>{main.dish_name}</Text>
                  </View>
                  <Pressable onPress={() => changeStep(0)} style={s.control}>
                    <Text style={s.link}>Change</Text>
                  </Pressable>
                </View>
              )}
              {COURSES.filter((course) =>
                shown.some(
                  (i) =>
                    classifyDish(i).course === course &&
                    servingKey(i) !== draft.main,
                ),
              ).map((course) => (
                <View key={course} style={{ gap: 12 }}>
                  <View style={s.between}>
                    <Text style={s.sectionTitle}>
                      {course === "main"
                        ? "Another main?"
                        : COURSE_LABELS[course]}
                    </Text>
                    <Text style={s.muted}>Optional</Text>
                  </View>
                  {shown
                    .filter(
                      (i) =>
                        classifyDish(i).course === course &&
                        servingKey(i) !== draft.main,
                    )
                    .map(foodCard)}
                </View>
              ))}
              {!shown.some((i) => servingKey(i) !== draft.main) && (
                <Text style={s.muted}>
                  No extras match this service and filter. Your main is enough
                  to continue.
                </Text>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <View style={s.mainSummary}>
                <Clock3 size={20} color={Colors.scarlet} />
                <View>
                  <Text style={s.sectionTitle}>
                    {labels[draft.period]} · Today
                  </Text>
                  <Text style={s.muted}>Logging this meal for now</Text>
                </View>
              </View>
              {selected.map((i) => (
                <View key={servingKey(i)} style={s.reviewItem}>
                  <View style={s.inline}>
                    <FoodIcon course={classifyDish(i).course} />
                    <Text style={[s.foodName, { flex: 1 }]}>{i.dish_name}</Text>
                    <Pressable
                      accessibilityLabel={`Remove ${i.dish_name}`}
                      style={s.control}
                      onPress={() =>
                        setDraft((d) => {
                          const q = { ...d.quantities };
                          delete q[servingKey(i)];
                          return {
                            ...d,
                            quantities: q,
                            main: d.main === servingKey(i) ? null : d.main,
                          };
                        })
                      }
                    >
                      <X size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={s.inline}>
                    <Text style={[s.muted, { flex: 1 }]}>
                      {i.serving_size || "Serving"}
                    </Text>
                    <Pressable
                      accessibilityLabel={`Less ${i.dish_name}`}
                      style={s.control}
                      onPress={() => portion(i, -0.5)}
                    >
                      <Minus size={16} color={Colors.ink} />
                    </Pressable>
                    <Text style={s.sectionTitle}>
                      {draft.quantities[servingKey(i)]}
                    </Text>
                    <Pressable
                      accessibilityLabel={`More ${i.dish_name}`}
                      style={s.control}
                      onPress={() => portion(i, 0.5)}
                    >
                      <Plus size={16} color={Colors.ink} />
                    </Pressable>
                  </View>
                </View>
              ))}
              {missingSelection && (
                <View style={s.empty}>
                  <Text style={s.error}>
                    Some draft items are no longer on this menu.
                  </Text>
                  <Button
                    label="Clear unavailable choices"
                    variant="ghost"
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        quantities: Object.fromEntries(
                          selected
                            .filter((i) => i.availability !== "unavailable")
                            .map((i) => [
                              servingKey(i),
                              d.quantities[servingKey(i)],
                            ]),
                        ),
                      }))
                    }
                  />
                </View>
              )}
              <View style={s.totals}>
                <Text style={s.sectionTitle}>
                  {partial ? "Known nutrition" : "Your meal total"}
                </Text>
                <View style={[s.inline, { gap: 30 }]}>
                  <Text style={s.totalValue}>
                    {Math.round(calories)}
                    <Text style={s.muted}> cal</Text>
                  </Text>
                  <Text style={s.totalValue}>
                    {Math.round(protein)}
                    <Text style={s.muted}> g protein</Text>
                  </Text>
                </View>
                {partial && (
                  <Text style={s.muted}>
                    Some nutrition is missing. These are partial totals.
                  </Text>
                )}
              </View>
            </>
          )}
        </Enter>
        <Text style={s.disclaimer}>
          Published menu · Availability can change. Check ingredients and
          allergens with dining staff.
        </Text>
      </ScrollView>
      <View style={s.footer}>
        <View style={s.footerInner}>
          <View style={s.between}>
            {step > 0 ? (
              <Pressable
                accessibilityLabel="Previous step"
                onPress={() => changeStep(step - 1)}
                style={s.secondaryLink}
              >
                <ArrowLeft size={18} color={Colors.ink} />
                <Text style={s.muted}>Back</Text>
              </Pressable>
            ) : (
              <Text style={s.muted}>
                {selected.length
                  ? `${selected.length} selected`
                  : "Choose something delicious"}
              </Text>
            )}
            <Text style={s.nutrition}>
              {selected.length
                ? `${Math.round(calories)}${partial ? "+" : ""} cal`
                : ""}
            </Text>
          </View>
          <Button
            loading={saving}
            label={
              step === 0
                ? "Add to my meal"
                : step === 1
                  ? "Review my plate"
                  : "Confirm meal"
            }
            disabled={
              !ready ||
              (step === 0 ? !main : !selected.length) ||
              (step === 2 && missingSelection)
            }
            onPress={() => (step < 2 ? changeStep(step + 1) : void confirm())}
            icon={<ArrowRight size={18} color="white" />}
          />
        </View>
      </View>
      <Modal
        visible={!!detail}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modal}>
            {detail && (
              <>
                <View style={s.inline}>
                  <FoodIcon course={classifyDish(detail).course} tile />
                  <Text style={[s.sectionTitle, { flex: 1 }]}>
                    {detail.dish_name}
                  </Text>
                  <Pressable
                    accessibilityLabel="Close dish details"
                    onPress={() => setDetail(null)}
                    style={s.control}
                  >
                    <X size={22} color={Colors.ink} />
                  </Pressable>
                </View>
                <ScrollView>
                  <Text style={s.subtitle}>
                    {detail.description || "Fresh from the dining hall menu."}
                  </Text>
                  <Text style={s.sectionTitle}>Allergens</Text>
                  <Text style={s.subtitle}>
                    {detail.allergens.length
                      ? detail.allergens.join(", ")
                      : "Allergen information not provided. Check with dining staff."}
                  </Text>
                  <Text style={s.sectionTitle}>Ingredients</Text>
                  <Text style={s.subtitle}>
                    {detail.ingredients ||
                      "Ask dining staff for the ingredient list."}
                  </Text>
                </ScrollView>
                <Button label="Got it" onPress={() => setDetail(null)} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.cream },
  page: {
    padding: 24,
    paddingBottom: 32,
    gap: 20,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  eyebrow: {
    ...Typography.monoLabel,
    fontSize: 10,
    letterSpacing: 1.8,
    color: Colors.scarlet,
  },
  inline: { flexDirection: "row", gap: 10, alignItems: "center" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 30,
  },
  title: {
    fontFamily: Fonts.outfit.semiBold,
    color: Colors.ink,
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -1.2,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: 10,
    marginBottom: 8,
    lineHeight: 23,
  },
  muted: { ...Typography.caption, color: Colors.textMuted },
  steps: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  stepDot: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: Colors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
    marginRight: 10,
  },
  period: {
    minHeight: 44,
    paddingHorizontal: 21,
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: Colors.canvas,
  },
  periodText: { ...Typography.bodySSemiBold, color: Colors.inkSoft },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 15,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    borderRadius: 16,
  },
  search: { flex: 1, minHeight: 48, ...Typography.body, color: Colors.ink },
  control: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filter: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: { ...Typography.title, color: Colors.ink },
  foodCard: {
    borderRadius: 22,
    borderColor: Colors.borderSoft,
    borderWidth: 1,
    backgroundColor: "white",
    overflow: "hidden",
  },
  selected: { borderColor: Colors.scarlet, backgroundColor: "#FCF3F1" },
  foodBody: {
    flexDirection: "row",
    gap: 15,
    alignItems: "center",
    padding: 18,
  },
  foodName: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 18,
    lineHeight: 23,
    color: Colors.ink,
  },
  nutrition: { ...Typography.caption, color: Colors.inkSoft },
  diet: { ...Typography.micro, color: Colors.green },
  check: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 18,
    paddingRight: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  detailButton: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 44,
  },
  link: { ...Typography.caption, color: Colors.scarlet },
  secondaryLink: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  mainSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: Colors.surfaceWarm,
  },
  reviewItem: {
    padding: 18,
    gap: 5,
    backgroundColor: "white",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  totals: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: 22,
    padding: 24,
    gap: 15,
  },
  totalValue: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 30,
    color: Colors.ink,
  },
  footer: {
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  footerInner: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 10,
    gap: 9,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  disclaimer: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  warning: {
    padding: 14,
    gap: 8,
    borderRadius: 14,
    backgroundColor: Colors.amberBg,
    flexDirection: "row",
    alignItems: "center",
  },
  error: { ...Typography.bodyS, color: Colors.scarlet },
  empty: {
    padding: 28,
    gap: 15,
    alignItems: "center",
    backgroundColor: Colors.surfaceWarm,
    borderRadius: 22,
  },
  success: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    gap: 20,
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: "#F6E4E5",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#14141466",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modal: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "85%",
    padding: 26,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.cream,
    gap: 20,
  },
});
