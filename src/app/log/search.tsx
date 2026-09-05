import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { Button, Card, Chip, IconButton, SegmentedControl, Stepper } from '@/components/ui';
import { ArrowLeft, Search, Star, UtensilsCrossed, X } from 'lucide-react-native';
import {
  FoodSearchResult,
  searchFoods,
} from '@/lib/foodSearch';
import { logMeal, periodForNow, scaleSearchResult, type MealPeriod } from '@/lib/logging';
import { getTodayString } from '@/store/logStore';
import { useMenuStore } from '@/store/menuStore';
import { scoreMeal } from '@/lib/health';
import { HealthScoreBadge } from '@/components/HealthScore';

type SourceFilter = 'all' | 'menu' | 'packaged';

/**
 * One search surface across today's DC menu and OpenFoodFacts. The two sources
 * are labelled, never blended: a Nutrislice serving and a per-100g packaged
 * value are different units and the compose sheet asks for the right one.
 */
export default function FoodSearchScreen() {
  const router = useRouter();
  const favorites = useMenuStore((state) => state.favorites);
  const toggleFavorite = useMenuStore((state) => state.toggleFavorite);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [todayOnly, setTodayOnly] = useState(true);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [errors, setErrors] = useState<{ menu?: string; openfoodfacts?: string }>({});
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<FoodSearchResult | null>(null);

  // Guards against a slow request landing after a newer one.
  const requestId = useRef(0);

  const runSearch = useCallback(
    async (text: string, servedOn: string | null, includePackaged: boolean) => {
      const id = ++requestId.current;
      if (text.trim().length < 2) {
        setResults([]);
        setErrors({});
        setHasSearched(false);
        setSearching(false);
        return;
      }

      setSearching(true);
      const response = await searchFoods(text, { servedOn, includePackaged });
      if (id !== requestId.current) return;

      setResults(response.results);
      setErrors(response.errors);
      setHasSearched(true);
      setSearching(false);
    },
    []
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      runSearch(query, todayOnly ? getTodayString() : null, filter !== 'menu');
    }, 350);
    return () => clearTimeout(handle);
  }, [query, todayOnly, filter, runSearch]);

  const visible = useMemo(() => {
    if (filter === 'menu') return results.filter((r) => r.source === 'menu');
    if (filter === 'packaged') return results.filter((r) => r.source === 'openfoodfacts');
    return results;
  }, [results, filter]);

  const menuCount = results.filter((r) => r.source === 'menu').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={Typography.title}>Search food</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.searchBlock}>
        <View style={styles.searchWrapper}>
          <Search size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the DC menu or a packaged food"
            placeholderTextColor={Colors.textGhost}
            style={styles.searchInput}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <X size={16} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <SegmentedControl
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'menu', label: 'DC menu' },
            { value: 'packaged', label: 'Packaged' },
          ]}
          value={filter}
          onChange={setFilter}
          style={{ marginTop: 12 }}
        />

        {filter !== 'packaged' ? (
          <View style={styles.todayRow}>
            <Chip
              label={todayOnly ? "Today's menu only" : 'All menu dates'}
              variant="muted"
              selected={todayOnly}
              onPress={() => setTodayOnly(!todayOnly)}
            />
            {hasSearched ? (
              <Text style={styles.countText}>
                {menuCount} DC {menuCount === 1 ? 'dish' : 'dishes'}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {errors.menu ? <ErrorNote text={errors.menu} /> : null}
        {errors.openfoodfacts && filter !== 'menu' ? (
          <ErrorNote text={errors.openfoodfacts} />
        ) : null}

        {searching && visible.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.scarlet} />
          </View>
        ) : null}

        {!searching && hasSearched && visible.length === 0 && !errors.menu ? (
          <View style={styles.centered}>
            <UtensilsCrossed size={30} color={Colors.textGhost} />
            <Text style={[Typography.title, { marginTop: 12 }]}>No matches</Text>
            <Text style={styles.emptyBody}>
              Nothing in {todayOnly ? "today's DC menu" : 'the DC menu'} or OpenFoodFacts matched
              "{query.trim()}". Try fewer words, or quick add it by hand.
            </Text>
            <Button
              label="Quick add instead"
              variant="secondary"
              onPress={() => router.replace('/log/quick-add' as any)}
              style={{ marginTop: 16, alignSelf: 'stretch' }}
            />
          </View>
        ) : null}

        {!hasSearched && !searching ? (
          <View style={styles.centered}>
            <Text style={styles.emptyBody}>
              Type at least two letters. DC dishes come from the college menu; everything else comes
              from OpenFoodFacts, where values are per 100 g.
            </Text>
          </View>
        ) : null}

        {visible.map((result) => (
          <ResultRow
            key={result.key}
            result={result}
            isFavorite={favorites.some((f) => f.dish_name === result.name)}
            onPress={() => setSelected(result)}
            onToggleFavorite={() =>
              toggleFavorite({
                dish_name: result.name,
                nutrislice_id: result.nutrislice_id,
                calories: result.calories,
                protein_g: result.protein_g,
                carbs_g: result.carbs_g,
                fat_g: result.fat_g,
                serving_size: result.serving_label,
                station_name: result.station_name,
                source: result.source === 'menu' ? 'menu' : 'barcode',
              })
            }
          />
        ))}
      </ScrollView>

      <ComposeSheet
        result={selected}
        onClose={() => setSelected(null)}
        onLogged={() => {
          setSelected(null);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <Card style={styles.errorCard}>
      <Text style={styles.errorText}>{text}</Text>
    </Card>
  );
}

function ResultRow({
  result,
  isFavorite,
  onPress,
  onToggleFavorite,
}: {
  result: FoodSearchResult;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={{ flex: 1, paddingRight: 12 }}>
        <View style={styles.rowTitleLine}>
          <Text style={Typography.bodySSemiBold} numberOfLines={2}>
            {result.name}
          </Text>
        </View>
        <Text style={styles.rowMeta}>
          {result.source === 'menu' ? 'DC' : 'PACKAGED'} · {result.subtitle || '—'}
        </Text>
        <Text style={styles.rowNutrition}>
          {result.calories !== null ? `${result.calories} kcal` : 'kcal unknown'} per{' '}
          {result.serving_label}
          {result.protein_g !== null ? ` · ${Math.round(result.protein_g)}P` : ''}
          {result.carbs_g !== null ? ` ${Math.round(result.carbs_g)}C` : ''}
          {result.fat_g !== null ? ` ${Math.round(result.fat_g)}F` : ''}
        </Text>
      </View>

      <Pressable
        onPress={onToggleFavorite}
        hitSlop={10}
        style={styles.starBtn}
        accessibilityLabel={isFavorite ? `Unsave ${result.name}` : `Save ${result.name}`}
      >
        <Star
          size={18}
          color={isFavorite ? Colors.gold : Colors.textGhost}
          fill={isFavorite ? Colors.gold : 'transparent'}
        />
      </Pressable>
    </Pressable>
  );
}

const GRAM_PRESETS = [30, 50, 100, 200];

function ComposeSheet({
  result,
  onClose,
  onLogged,
}: {
  result: FoodSearchResult | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [servings, setServings] = useState(1);
  const [grams, setGrams] = useState('100');
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(periodForNow());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result) {
      setServings(1);
      setGrams('100');
      setMealPeriod(periodForNow());
      setError(null);
    }
  }, [result?.key]);

  const perGram = result?.basis === 'per_100g';
  const gramValue = Number(grams);
  const quantity = perGram ? gramValue : servings;
  const quantityValid = Number.isFinite(quantity) && quantity > 0 && (!perGram || quantity <= 2000);

  const item = result && quantityValid ? scaleSearchResult(result, quantity) : null;
  const score = item ? scoreMeal(item) : null;

  const handleLog = async () => {
    if (!result || !item || saving) return;
    setSaving(true);
    setError(null);

    const outcome = await logMeal({
      title: result.name,
      meal_period: mealPeriod,
      source: result.source === 'menu' ? 'menu' : 'manual',
      items: [item],
    });

    setSaving(false);

    if (outcome.nutrientError) {
      setError(outcome.nutrientError);
      return;
    }
    onLogged();
  };

  return (
    <Modal
      visible={!!result}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          {result ? (
            <>
              <View style={styles.sheetHandle} />
              <Text style={Typography.title} numberOfLines={2}>
                {result.name}
              </Text>
              <Text style={styles.rowMeta}>
                {result.source === 'menu' ? 'DC MENU' : 'OPENFOODFACTS'} · {result.subtitle}
              </Text>

              <View style={styles.sheetTotals}>
                <View>
                  <Text style={Typography.displayL}>{item ? item.calories : '—'}</Text>
                  <Text style={Typography.monoUnit}>KCAL</Text>
                </View>
                {score ? <HealthScoreBadge score={score} /> : null}
              </View>

              <View style={styles.sheetMacros}>
                <SheetMacro label="Protein" value={item?.protein_g} />
                <SheetMacro label="Carbs" value={item?.carbs_g} />
                <SheetMacro label="Fat" value={item?.fat_g} />
                {item?.fiber_g !== null && item?.fiber_g !== undefined ? (
                  <SheetMacro label="Fiber" value={item.fiber_g} />
                ) : null}
              </View>

              <Text style={[styles.sheetLabel, { marginTop: 18 }]}>
                {perGram ? 'HOW MANY GRAMS?' : 'HOW MANY SERVINGS?'}
              </Text>

              {perGram ? (
                <View>
                  <View style={styles.gramRow}>
                    <TextInput
                      value={grams}
                      onChangeText={setGrams}
                      keyboardType="number-pad"
                      style={styles.gramInput}
                      maxLength={4}
                      accessibilityLabel="Grams"
                    />
                    <Text style={styles.gramUnit}>g</Text>
                  </View>
                  <View style={styles.presetRow}>
                    {GRAM_PRESETS.map((preset) => (
                      <Chip
                        key={preset}
                        label={`${preset} g`}
                        variant="muted"
                        selected={gramValue === preset}
                        onPress={() => setGrams(String(preset))}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Stepper
                    value={servings}
                    onChange={setServings}
                    step={0.25}
                    unitLabel={result.serving_label}
                  />
                </View>
              )}

              <Text style={[styles.sheetLabel, { marginTop: 18 }]}>LOG TO</Text>
              <SegmentedControl
                options={[
                  { value: 'breakfast', label: 'Breakfast' },
                  { value: 'lunch', label: 'Lunch' },
                  { value: 'dinner', label: 'Dinner' },
                  { value: 'snack', label: 'Snack' },
                ]}
                value={mealPeriod}
                onChange={setMealPeriod}
              />

              {error ? <Text style={styles.sheetError}>{error}</Text> : null}
              {!quantityValid ? (
                <Text style={styles.sheetError}>
                  Enter an amount between 1 and 2000 g to log this.
                </Text>
              ) : null}

              <Button
                label="Log it"
                variant="primary"
                loading={saving}
                disabled={!item}
                onPress={handleLog}
                style={{ marginTop: 18 }}
              />
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetMacro({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <View style={styles.sheetMacroCol}>
      <Text style={Typography.caption}>{label}</Text>
      <Text style={Typography.title}>
        {value === null || value === undefined ? '—' : `${Math.round(value)}g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSoft,
  },
  searchBlock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  searchWrapper: {
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.outfit.regular,
    color: Colors.ink,
    height: '100%',
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  countText: {
    ...Typography.monoUnit,
    color: Colors.textFaint,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 8,
  },
  emptyBody: {
    ...Typography.bodyS,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMeta: {
    ...Typography.monoUnit,
    marginTop: 4,
    color: Colors.textFaint,
  },
  rowNutrition: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 4,
  },
  starBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    marginBottom: 12,
    backgroundColor: '#FFF7F7',
    borderColor: 'rgba(226, 58, 80, 0.35)',
  },
  errorText: {
    ...Typography.bodyS,
    color: Colors.scarlet,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 20, 20, 0.35)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.cream,
    borderTopLeftRadius: Radii.cardLg,
    borderTopRightRadius: Radii.cardLg,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.track3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTotals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  sheetMacros: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  sheetMacroCol: {
    flex: 1,
  },
  sheetLabel: {
    ...Typography.monoLabel,
    marginBottom: 10,
  },
  gramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 54,
    paddingHorizontal: 16,
  },
  gramInput: {
    flex: 1,
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 20,
    color: Colors.ink,
    padding: 0,
  },
  gramUnit: {
    ...Typography.monoLabel,
    marginLeft: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  sheetError: {
    ...Typography.caption,
    color: Colors.scarlet,
    marginTop: 12,
  },
});
