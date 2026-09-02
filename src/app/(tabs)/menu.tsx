import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { SegmentedControl, Chip } from '@/components/ui';
import { Search, Plus, Check, AlertCircle, Clock, X, ListPlus, Bookmark, Sparkles } from 'lucide-react-native';
import { useMenuStore } from '@/store/menuStore';
import { ParsedMenuItem } from '@/lib/nutrislice';
import { logMeal, periodForNow } from '@/lib/logging';
import { getTodayString } from '@/store/logStore';

export default function MenuScreen() {
  const router = useRouter();
  const menuItems = useMenuStore((state) => state.items);
  const isStale = useMenuStore((state) => state.isStale);
  const syncedAt = useMenuStore((state) => state.syncedAt);
  const refreshError = useMenuStore((state) => state.refreshError);

  const todayStr = getTodayString();
  const [mealPeriod, setMealPeriod] = useState<'lunch' | 'dinner' | 'breakfast' | 'coop'>('lunch');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [dismissStaleness, setDismissStaleness] = useState(false);
  const [loggedItemIds, setLoggedItemIds] = useState<Record<number, boolean>>({});
  const [loggingItemIds, setLoggingItemIds] = useState<Record<number, boolean>>({});
  const [logError, setLogError] = useState<string | null>(null);

  // Filter and group by station.
  //
  // The date filter matters for more than freshness: nutrislice_id identifies a
  // *dish*, not a serving, so the same dish recurs across every date it is
  // served (Pasta appears 11 times in one sync). Without pinning to a single
  // day this screen rendered the whole week at once and handed React duplicate
  // keys for the repeats.
  const stationGroups = useMemo(() => {
    const periodItems = menuItems.filter((item) => {
      if (item.served_date !== todayStr) return false;
      if (mealPeriod === 'coop') {
        return item.station_name.toLowerCase().includes('coop') || item.station_name.toLowerCase().includes('grill');
      }
      return item.meal_period === mealPeriod;
    });

    const groups: Record<string, ParsedMenuItem[]> = {};
    const seen = new Set<number>();

    for (const item of periodItems) {
      // Belt and braces: one physical dish can still be listed at two stations
      // on the same day, and a duplicate key is a rendering bug either way.
      if (seen.has(item.nutrislice_id)) continue;
      seen.add(item.nutrislice_id);

      const matchesSearch = item.dish_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTag =
        !selectedTag ||
        item.dietary_tags.includes(selectedTag) ||
        (selectedTag === 'High Protein' && (item.protein_g ?? 0) >= 20);

      if (matchesSearch && matchesTag) {
        const station = item.station_name || 'The Main Line';
        if (!groups[station]) groups[station] = [];
        groups[station].push(item);
      }
    }

    return groups;
  }, [menuItems, mealPeriod, searchQuery, selectedTag, todayStr]);

  const stationNames = Object.keys(stationGroups);

  const handleQuickLog = async (item: ParsedMenuItem) => {
    if (item.calories === null || loggingItemIds[item.nutrislice_id]) return;

    setLogError(null);
    setLoggingItemIds((prev) => ({ ...prev, [item.nutrislice_id]: true }));

    try {
      await logMeal({
        title: item.dish_name,
        meal_period: mealPeriod === 'coop' ? periodForNow() : mealPeriod,
        source: 'menu',
        items: [
          {
            name: item.dish_name,
            portion: 1,
            portion_unit: item.serving_size || 'serving',
            calories: item.calories,
            protein_g: item.protein_g ?? 0,
            carbs_g: item.carbs_g ?? 0,
            fat_g: item.fat_g ?? 0,
          },
        ],
      });

      setLoggedItemIds((prev) => ({ ...prev, [item.nutrislice_id]: true }));
      setTimeout(() => {
        setLoggedItemIds((prev) => ({ ...prev, [item.nutrislice_id]: false }));
      }, 1500);
    } catch (e: any) {
      setLogError(`Could not log "${item.dish_name}": ${e?.message ?? 'unknown error'}`);
    } finally {
      setLoggingItemIds((prev) => ({ ...prev, [item.nutrislice_id]: false }));
    }
  };

  const getMealPeriodTiming = () => {
    switch (mealPeriod) {
      case 'breakfast':
        return 'Breakfast, 7:30am – 10:00am';
      case 'lunch':
        return 'Lunch, 11:30am – 2:00pm';
      case 'dinner':
        return 'Dinner, 5:00pm – 7:30pm';
      case 'coop':
        return 'The Coop, 11:00am – 10:00pm';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>Dining Center</Text>
          <Text style={[Typography.body, { color: Colors.textMuted, marginTop: 4 }]}>
            {getMealPeriodTiming()}
          </Text>
        </View>

        {/* Staleness Banner if >26h (§4 Screen 09) */}
        {(isStale || refreshError) && !dismissStaleness ? (
          <View style={styles.stalenessBanner}>
            <Clock size={16} color={Colors.amber} style={{ marginRight: 8 }} />
            <Text style={styles.stalenessText}>
              {refreshError
                ? `Live refresh failed. Showing cached menu from ${new Date(syncedAt).toLocaleDateString()}.`
                : `Showing cached menu from ${new Date(syncedAt).toLocaleDateString()}. Live sync pending.`}
            </Text>
            <Pressable
              onPress={() => setDismissStaleness(true)}
              hitSlop={8}
              accessibilityLabel="Dismiss banner"
            >
              <X size={16} color={Colors.amber} />
            </Pressable>
          </View>
        ) : null}

        {/* Meal Period Segmented Control */}
        <SegmentedControl
          options={[
            { value: 'breakfast', label: 'Breakfast' },
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
            { value: 'coop', label: 'Coop' },
          ]}
          value={mealPeriod}
          onChange={setMealPeriod}
          style={{ marginBottom: 14 }}
        />

        {/* Dietary Filter Chips */}
        <View style={styles.filterRow}>
          <Chip
            label="All"
            selected={selectedTag === null}
            onPress={() => setSelectedTag(null)}
          />
          <Chip
            label="Vegan"
            selected={selectedTag === 'Vegan'}
            onPress={() => setSelectedTag(selectedTag === 'Vegan' ? null : 'Vegan')}
          />
          <Chip
            label="Vegetarian"
            selected={selectedTag === 'Vegetarian'}
            onPress={() => setSelectedTag(selectedTag === 'Vegetarian' ? null : 'Vegetarian')}
          />
          <Chip
            label="Wheat-Free"
            selected={selectedTag === 'Wheat-Free'}
            onPress={() => setSelectedTag(selectedTag === 'Wheat-Free' ? null : 'Wheat-Free')}
          />
          <Chip
            label="High Protein (20g+)"
            selected={selectedTag === 'High Protein'}
            onPress={() => setSelectedTag(selectedTag === 'High Protein' ? null : 'High Protein')}
          />
        </View>

        {/* Search Field */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrapper}>
            <Search size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              placeholder="Search today's menu"
              placeholderTextColor={Colors.textGhost}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
            />
          </View>

          <Pressable
            onPress={() => router.push('/log/search' as any)}
            style={styles.iconLinkBtn}
            accessibilityLabel="Search packaged foods too"
          >
            <ListPlus size={18} color={Colors.ink} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/log/saved' as any)}
            style={styles.iconLinkBtn}
            accessibilityLabel="Saved meals"
          >
            <Bookmark size={18} color={Colors.ink} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/log/plate' as any)}
          style={({ pressed }) => [styles.buildPlateBtn, pressed && { opacity: 0.9 }]}
        >
          <Sparkles size={16} color={Colors.cream} />
          <Text style={styles.buildPlateBtnText}>Build my plate for today's target</Text>
        </Pressable>

        {logError ? (
          <View style={styles.logErrorBanner}>
            <Text style={styles.logErrorText}>{logError}</Text>
          </View>
        ) : null}

        {/* Station-Grouped Items */}
        {stationNames.map((station) => (
          <View key={station} style={styles.stationGroup}>
            <Text style={styles.stationTitle}>{station}</Text>
            {stationGroups[station].map((item) => {
              const isLogged = loggedItemIds[item.nutrislice_id];
              return (
                <Pressable
                  key={item.nutrislice_id}
                  onPress={() => router.push(`/food/${item.nutrislice_id}` as any)}
                  style={styles.foodRow}
                >
                  <View style={styles.foodInfo}>
                    <Text style={Typography.title}>{item.dish_name}</Text>
                    <Text style={styles.nutritionLine}>
                      {item.calories !== null
                        ? `${item.calories} kcal · ${item.protein_g ?? 0}P ${item.carbs_g ?? 0}C ${item.fat_g ?? 0}F`
                        : 'Nutrition info pending'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      handleQuickLog(item);
                    }}
                    disabled={item.calories === null || loggingItemIds[item.nutrislice_id]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[
                      styles.addBtn,
                      isLogged ? styles.addBtnLogged : null,
                      item.calories === null ? styles.addBtnDisabled : null,
                    ]}
                    accessibilityLabel={`Log 1 serving of ${item.dish_name}`}
                  >
                    {loggingItemIds[item.nutrislice_id] ? (
                      <ActivityIndicator size="small" color={Colors.ink} />
                    ) : isLogged ? (
                      <Check size={18} color={Colors.cream} />
                    ) : (
                      <Plus size={20} color={Colors.ink} />
                    )}
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        ))}

        {stationNames.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[Typography.body, { color: Colors.textMuted }]}>
              No dishes found matching your filters for {mealPeriod}.
            </Text>
          </View>
        ) : null}

        {/* Allergen Disclaimer */}
        <View style={styles.disclaimerBox}>
          <AlertCircle size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={styles.disclaimerText}>
            Cross-contact risk exists in commercial kitchens. Check Nutrislice for complete allergen tables.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  stalenessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.amberBg,
    borderWidth: 1,
    borderColor: Colors.amberBorder,
    borderRadius: Radii.card,
    padding: 12,
    marginBottom: 16,
  },
  stalenessText: {
    ...Typography.caption,
    color: '#92400E',
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  searchWrapper: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  iconLinkBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildPlateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: Radii.pill,
    backgroundColor: Colors.scarlet,
    marginBottom: 20,
  },
  buildPlateBtnText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.cream,
  },
  logErrorBanner: {
    backgroundColor: Colors.amberBg,
    borderWidth: 1,
    borderColor: Colors.amberBorder,
    borderRadius: Radii.card,
    padding: 12,
    marginBottom: 14,
  },
  logErrorText: {
    ...Typography.caption,
    color: '#92400E',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.outfit.regular,
    color: Colors.ink,
    height: '100%',
  },
  stationGroup: {
    marginBottom: 24,
  },
  stationTitle: {
    ...Typography.monoLabel,
    color: Colors.scarlet,
    marginBottom: 10,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 10,
  },
  foodInfo: {
    flex: 1,
    paddingRight: 12,
  },
  nutritionLine: {
    ...Typography.monoUnit,
    marginTop: 4,
    color: Colors.textMuted,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtnLogged: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  disclaimerText: {
    ...Typography.micro,
    color: Colors.textMuted,
    flex: 1,
  },
});
