import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import {
  Button,
  Card,
  IconButton,
  Stepper,
  SegmentedControl,
} from '@/components/ui';
import { ArrowLeft, Star, AlertCircle, ExternalLink } from 'lucide-react-native';
import { useMenuStore, favoriteFromMenuItem } from '@/store/menuStore';

export default function FoodDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const menuItems = useMenuStore((state) => state.items);
  const isFavoriteFn = useMenuStore((state) => state.isFavorite);
  const toggleFavorite = useMenuStore((state) => state.toggleFavorite);

  const numericId = parseInt(id as string, 10);
  const dish = menuItems.find((item) => item.nutrislice_id === numericId) || {
    nutrislice_id: numericId || 2073447,
    dish_name: 'Tempura Chicken',
    station_name: 'The Main Line',
    calories: 511,
    protein_g: 37,
    carbs_g: 25,
    fat_g: 30,
    serving_size: '8 oz',
    ingredients: 'Chicken breast, battered with tempura flour (wheat, corn starch, salt, egg powder, turmeric extract, leavening), fried in zero trans fat vegetable oil.',
    dietary_tags: [] as string[],
    allergens: ['Egg', 'Wheat'],
  };

  const isFav = isFavoriteFn(dish.dish_name);

  const [portion, setPortion] = useState(1);
  const [mealPeriod, setMealPeriod] = useState<'breakfast' | 'lunch' | 'dinner'>('lunch');

  const baseCals = dish.calories ?? 0;
  const baseProt = dish.protein_g ?? 0;
  const baseCarbs = dish.carbs_g ?? 0;
  const baseFat = dish.fat_g ?? 0;

  const totalCals = Math.round(baseCals * portion);
  const totalProt = Math.round(baseProt * portion);
  const totalCarbs = Math.round(baseCarbs * portion);
  const totalFat = Math.round(baseFat * portion);

  const handleAdd = () => {
    router.back();
  };

  const allergenMeta = [
    dish.station_name,
    dish.allergens.length > 0 ? `contains ${dish.allergens.join(', ').toLowerCase()}` : null,
    dish.dietary_tags.length > 0 ? dish.dietary_tags.join(', ').toLowerCase() : null,
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topHeader}>
        <IconButton
          icon={<ArrowLeft size={18} color={Colors.inkSoft} />}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <IconButton
          icon={
            <Star
              size={18}
              color={isFav ? Colors.gold : Colors.inkSoft}
              fill={isFav ? Colors.gold : 'transparent'}
            />
          }
          onPress={() => toggleFavorite(favoriteFromMenuItem(dish))}
          accessibilityLabel="Toggle favorite"
        />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Title and Meta */}
        <View style={styles.header}>
          <Text style={Typography.displayL}>{dish.dish_name}</Text>
          <Text style={[Typography.monoLabel, { marginTop: 6 }]}>
            {allergenMeta.toUpperCase()}
          </Text>
        </View>

        {/* Portion Stepper */}
        <View style={styles.stepperContainer}>
          <Stepper
            value={portion}
            onChange={setPortion}
            step={0.25}
            unitLabel={dish.serving_size || 'serving'}
          />
        </View>

        {/* Meal Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>LOG TO MEAL</Text>
          <SegmentedControl
            options={[
              { value: 'breakfast', label: 'Breakfast' },
              { value: 'lunch', label: 'Lunch' },
              { value: 'dinner', label: 'Dinner' },
            ]}
            value={mealPeriod}
            onChange={setMealPeriod}
          />
        </View>

        {/* 4-Up Macro Tiles */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>NUTRITION FACTS</Text>
          <View style={styles.macroGrid}>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>CALORIES</Text>
              <Text style={Typography.displayM}>{dish.calories !== null ? totalCals : '—'}</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>PROTEIN</Text>
              <Text style={Typography.displayM}>{dish.protein_g !== null ? `${totalProt}g` : '—'}</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>CARBS</Text>
              <Text style={Typography.displayM}>{dish.carbs_g !== null ? `${totalCarbs}g` : '—'}</Text>
            </Card>
            <Card style={styles.macroTile}>
              <Text style={Typography.monoUnit}>FAT</Text>
              <Text style={Typography.displayM}>{dish.fat_g !== null ? `${totalFat}g` : '—'}</Text>
            </Card>
          </View>
        </View>

        {/* Ingredients & Prep */}
        {dish.ingredients ? (
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>INGREDIENTS</Text>
            <Card style={{ padding: 16 }}>
              <Text style={[Typography.bodyS, { color: Colors.textMuted, lineHeight: 22 }]}>
                {dish.ingredients}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Disclaimer with Nutrislice Link */}
        <Pressable
          onPress={() => Linking.openURL('https://haverfordcollege.nutrislice.com')}
          style={styles.disclaimerCard}
        >
          <AlertCircle size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <Text style={styles.disclaimerText}>
            Nutrition data sourced from Haverford Nutrislice. Tap to view official college labels.
          </Text>
          <ExternalLink size={14} color={Colors.textMuted} style={{ marginLeft: 6 }} />
        </Pressable>
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarContent}>
          <View>
            <Text style={Typography.caption}>Adds to {mealPeriod}</Text>
            <Text style={Typography.title}>
              {dish.calories !== null ? `${totalCals} kcal` : 'Custom Item'}
            </Text>
          </View>
          <Button
            label={`Add to ${mealPeriod}`}
            variant="primary"
            onPress={handleAdd}
            style={{ minWidth: 160 }}
          />
        </View>
      </View>
    </SafeAreaView>
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
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  stepperContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionEyebrow: {
    ...Typography.monoLabel,
    marginBottom: 8,
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  macroTile: {
    width: '48%',
    padding: 16,
    alignItems: 'center',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    padding: 14,
    borderRadius: Radii.card,
    marginTop: 8,
  },
  disclaimerText: {
    ...Typography.micro,
    color: Colors.textMuted,
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
