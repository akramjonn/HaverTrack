import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, Plus, UtensilsCrossed, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography } from '@/constants/theme';
import { Button, Stepper } from '@/components/ui';
import { useMenuStore } from '@/store/menuStore';
import { campusDate, featuredLogItem, featuredMeals, mealHeadline } from '@/lib/featuredMeal';
import { servingKey } from '@/lib/mealFlow';
import { logMeal } from '@/lib/logging';
import type { ParsedMenuItem } from '@/lib/nutrislice';
import { MealArtwork } from './MealArtwork';

export function FeaturedMeal({ previewItems }: { previewItems?: ParsedMenuItem[] }) {
  const router = useRouter();
  const items = useMenuStore(s => s.items);
  const refreshing = useMenuStore(s => s.isRefreshing);
  const refreshError = useMenuStore(s => s.refreshError);
  const refresh = useMenuStore(s => s.refreshMenu);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { setNow(new Date()); if (!previewItems) void refresh(); }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [previewItems, refresh]);
  const mains = featuredMeals(previewItems ?? items, now);
  const [selected, setSelected] = useState<ParsedMenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hero = mains[0];
  return <View style={styles.section}>
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>THE CAMPUS TABLE</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/menu')} style={styles.menuLink}>
        <Text style={styles.linkText}>Full menu</Text><ArrowRight size={16} color={Colors.forest} />
      </Pressable>
    </View>
    {hero ? <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${hero.dish_name}. View details and add to your log.`}
        onPress={() => { setNotice(null); setSelected(hero); }} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.88 }]}>
        <View style={styles.topline}><View style={styles.dot} /><Text style={[styles.eyebrow, { flexShrink: 1 }]}>ON TODAY’S MENU · {hero.meal_period.toUpperCase()}</Text></View>
        <Text style={styles.headline}>{mealHeadline(hero.dish_name)}</Text>
        <View style={styles.artRow}>
          <View style={styles.dishInfo}>
            <Text style={styles.dishName}>{hero.dish_name}</Text>
            <Text style={styles.meta}>{hero.station_name}</Text>
            <Text style={styles.serving}>{hero.calories == null ? 'Nutrition incomplete' : `${Math.round(hero.calories)} kcal per serving`}</Text>
          </View>
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><MealArtwork name={hero.dish_name} size={162} /></View>
        </View>
        <View style={styles.heroFooter}><Text style={styles.cta}>Make it your meal</Text><View style={styles.plus}><Plus size={20} color={Colors.cream} /></View></View>
      </Pressable>
      {refreshError && !previewItems ? <Text style={styles.status}>Showing today’s saved menu. Live refresh is unavailable.</Text> : null}
      {mains.length > 1 ? <View style={styles.alternatives}>
        {mains.slice(1).map(item => <Pressable key={servingKey(item)} accessibilityRole="button" accessibilityLabel={`View and log ${item.dish_name}`}
          onPress={() => { setNotice(null); setSelected(item); }} style={({ pressed }) => [styles.alternative, pressed && { opacity: 0.7 }]}>
          <Text style={styles.alternativePeriod}>{item.meal_period.toUpperCase()}</Text>
          <Text style={styles.alternativeName} numberOfLines={2}>{item.dish_name}</Text>
          <View style={styles.alternativeBottom}><Text style={styles.meta}>Also on the menu</Text><Plus size={17} color={Colors.forest} /></View>
        </Pressable>)}
      </View> : null}
    </> : <View style={[styles.hero, { gap: 14 }]}>
      <UtensilsCrossed size={26} color={Colors.forest} />
      <Text style={styles.headline}>{refreshing ? 'Setting\nthe table…' : 'Good things\nare on the way.'}</Text>
      <Text style={styles.meta}>Today’s featured dishes aren’t available yet. You can still scan a plate or browse the menu.</Text>
      <Button label={refreshing ? 'Refreshing menu…' : 'Refresh today’s menu'} loading={refreshing} onPress={() => void refresh()} />
    </View>}
    {notice ? <View accessibilityLiveRegion="polite" style={styles.notice}><Check size={18} color={Colors.forest} /><Text style={[styles.meta, { flex: 1 }]}>{notice}</Text></View> : null}
    {selected ? <FeaturedMealSheet key={servingKey(selected)} item={selected} preview={!!previewItems}
      onClose={() => setSelected(null)} onSaved={message => { setSelected(null); setNotice(message); }} /> : null}
  </View>;
}

function FeaturedMealSheet({ item, onClose, onSaved, preview }: {
  item: ParsedMenuItem; onClose: () => void; onSaved: (message: string) => void; preview: boolean;
}) {
  const [portion, setPortion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function save() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      if (preview) { onSaved('Preview complete. No meal was saved.'); return; }
      const current = useMenuStore.getState().items.find(i => servingKey(i) === servingKey(item));
      if (!current || current.served_date !== campusDate() || current.availability === 'unavailable' || current.availability === 'unknown') {
        throw new Error('The menu has changed. Close this dish and refresh today’s menu.');
      }
      const result = await logMeal({ title: current.dish_name, source: 'menu',
        meal_period: current.meal_period === 'brunch' ? 'breakfast' : current.meal_period,
        items: [featuredLogItem(current, portion)],
      });
      if (!result.mealLogId) throw new Error('Your meal could not be saved. Please try again.');
      onSaved(result.mealLogId.startsWith('local-') ? 'Added on this device. Your meal will sync when you’re online.'
        : result.nutrientError ?? `${current.dish_name} added to your log.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your meal. Please try again.'); }
    finally { busy.current = false; setSaving(false); }
  }
  const complete = [item.calories, item.protein_g, item.carbs_g, item.fat_g].every(n => n != null);
  return <Modal transparent animationType="slide" onRequestClose={() => { if (!busy.current) onClose(); }}>
    <View style={styles.modal}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close meal details" onPress={() => { if (!busy.current) onClose(); }} />
      <View style={styles.sheet} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.sectionHeading}><Text style={styles.eyebrow}>TODAY · {item.meal_period.toUpperCase()}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close meal details" disabled={saving} onPress={onClose} style={styles.close}><X color={Colors.ink} size={22} /></Pressable></View>
          <Text style={Typography.displayL}>{item.dish_name}</Text>
          <Text style={styles.meta}>{item.station_name} · {item.serving_size || '1 serving'}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <View style={styles.nutrients}>
            {([['kcal', item.calories], ['protein', item.protein_g], ['carbs', item.carbs_g], ['fat', item.fat_g]] as const).map(([label, value]) => <View key={label} style={{ flex: 1 }}>
              <Text style={Typography.title}>{value == null ? '—' : `${Math.round(value * portion)}${label === 'kcal' ? '' : 'g'}`}</Text><Text style={styles.meta}>{label}</Text>
            </View>)}
          </View>
          {!complete ? <Text style={styles.meta}>Some nutrition is unavailable. This meal will be marked as partial in your log.</Text> : null}
          {item.allergens.length ? <Text style={styles.description}>Contains: {item.allergens.join(', ')}</Text> : null}
          {item.dietary_tags.length ? <Text style={styles.meta}>{item.dietary_tags.join(' · ')}</Text> : null}
          <Text style={[styles.eyebrow, { marginTop: 24 }]}>YOUR PORTION</Text>
          <View style={{ alignItems: 'center', paddingVertical: 16 }}><Stepper value={portion} onChange={setPortion} min={0.25} max={10} step={0.25} unitLabel="servings" /></View>
          <Text style={[styles.meta, { textAlign: 'center', marginBottom: 16 }]}>Adds to today’s {item.meal_period === 'brunch' ? 'breakfast' : item.meal_period} log</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button label="Add to my log" icon={<Plus size={18} color={Colors.cream} />} onPress={() => void save()} loading={saving} />
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  eyebrow: { ...Typography.monoLabel, fontSize: 10, letterSpacing: 1.3, color: Colors.forest },
  menuLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  linkText: { ...Typography.caption, color: Colors.forest },
  hero: { backgroundColor: Colors.butter, borderRadius: 28, padding: 22, overflow: 'hidden' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 18 },
  dot: { width: 6, height: 6, backgroundColor: Colors.forest, borderRadius: 3 },
  headline: { ...Typography.editorial, fontSize: 39, lineHeight: 43, color: Colors.forest, letterSpacing: -1.3 },
  artRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, minHeight: 160 },
  dishInfo: { flex: 1, zIndex: 1, paddingVertical: 12 },
  dishName: { ...Typography.title, color: Colors.forest, fontSize: 20, lineHeight: 25, marginBottom: 7 },
  art: { marginRight: -28, marginLeft: -6, transform: [{ rotate: '8deg' }] },
  meta: { ...Typography.micro, color: Colors.inkSoft },
  serving: { ...Typography.micro, color: Colors.forest, marginTop: 12 },
  heroFooter: { borderTopWidth: 1, borderTopColor: '#D7C785', paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: { ...Typography.bodySSemiBold, color: Colors.forest },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.forest, alignItems: 'center', justifyContent: 'center' },
  alternatives: { flexDirection: 'row', gap: 10, marginTop: 10 },
  alternative: { flex: 1, padding: 15, borderRadius: 20, backgroundColor: Colors.sage },
  alternativePeriod: { ...Typography.monoLabel, fontSize: 9, color: Colors.forest, marginBottom: 7 },
  alternativeName: { ...Typography.bodySSemiBold, color: Colors.ink, minHeight: 40 },
  alternativeBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' },
  notice: { padding: 14, backgroundColor: Colors.sage, flexDirection: 'row', gap: 8, borderRadius: 14, marginTop: 12 },
  status: { ...Typography.micro, color: Colors.textMuted, marginTop: 8 },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(23, 43, 34, 0.45)' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 620, alignSelf: 'center', backgroundColor: Colors.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { padding: 24, paddingBottom: 42 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  nutrients: { flexDirection: 'row', gap: 8, paddingVertical: 20, marginVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  description: { ...Typography.bodyS, color: Colors.inkSoft, marginTop: 12 },
  error: { ...Typography.bodyS, color: Colors.scarlet, marginBottom: 12 },
});
