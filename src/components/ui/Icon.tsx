import React from 'react';
import { StyleProp, ViewStyle, Platform } from 'react-native';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Beef,
  BookOpen,
  Bookmark,
  CakeSlice,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Coffee,
  Croissant,
  Download,
  Droplet,
  Dumbbell,
  Equal,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Footprints,
  GlassWater,
  Heart,
  HeartHandshake,
  Images,
  Info,
  Layers,
  Leaf,
  ListPlus,
  LogOut,
  Minus,
  Moon,
  NotebookPen,
  Pizza,
  Plus,
  RotateCcw,
  RotateCw,
  Salad,
  ScanBarcode,
  Scale,
  Search,
  ShieldCheck,
  Soup,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Utensils,
  UtensilsCrossed,
  Wheat,
  WheatOff,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { Colors, IconSize, IconStroke } from '@/constants/theme';

/**
 * Every glyph the app is allowed to draw, keyed by what it *means* rather than
 * by which Lucide export it happens to be. Screens import `Icon` and ask for
 * `name="quickAdd"`, so re-pointing an idea at a different glyph is a one-line
 * change here instead of a grep across twenty files — and two screens can never
 * quietly drift onto two different marks for the same concept.
 */
const glyphs = {
  // Navigation and structural affordances
  today: Utensils,
  menu: ChefHat,
  progress: TrendingUp,
  profile: User,
  back: ArrowLeft,
  close: X,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  external: ExternalLink,

  // Editing actions
  add: Plus,
  remove: Minus,
  check: Check,
  trash: Trash2,
  retake: RotateCw,
  undo: RotateCcw,
  star: Star,
  saved: Bookmark,
  reveal: Eye,
  conceal: EyeOff,

  // The five ways a meal can get into the log. These are the app's primary
  // verbs, so each one keeps a distinct silhouette rather than a variation on
  // a plate: camera, chef's hat, magnifier, notepad, bookmark. Quick add takes
  // the notepad rather than a lightning bolt because the bolt is already the
  // camera's flash toggle two screens away.
  scan: Camera,
  barcode: ScanBarcode,
  search: Search,
  quickAdd: NotebookPen,
  savedMeals: Bookmark,
  buildPlate: Sparkles,
  browseMenu: ListPlus,

  // Camera controls
  photoLibrary: Images,
  flashOn: Zap,
  flashOff: ZapOff,
  cameraOff: CameraOff,
  analyzing: Sparkles,

  // Macros. Paired with MacroColors so the glyph and the hue always agree.
  protein: Beef,
  carbs: Wheat,
  fat: Droplet,

  // Metrics
  calories: Flame,
  streak: Flame,
  weight: Scale,
  water: GlassWater,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  tracking: Activity,
  maintain: Equal,

  // Onboarding: the four goals and the three activity levels
  goalLose: TrendingDown,
  goalMaintain: Equal,
  goalGain: TrendingUp,
  goalTrack: Activity,
  activityLow: BookOpen,
  activityMedium: Footprints,
  activityHigh: Dumbbell,

  // Dining-hall meal periods, read as times of day the way Recime does it.
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  coop: Coffee,

  // Dining-hall stations
  stationGrill: Flame,
  stationSalad: Salad,
  stationPizza: Pizza,
  stationSoup: Soup,
  stationDeli: UtensilsCrossed,
  stationBakery: Croissant,
  stationDessert: CakeSlice,
  stationVegan: Leaf,
  stationMain: Utensils,

  // Dietary filters
  vegan: Leaf,
  vegetarian: Sprout,
  wheatFree: WheatOff,

  // Status and messaging
  info: Info,
  warning: AlertCircle,
  success: CheckCircle2,
  insight: Sparkles,
  wellbeing: HeartHandshake,
  care: Heart,
  shield: ShieldCheck,
  clock: Clock,
  document: FileText,
  download: Download,
  signOut: LogOut,
  layers: Layers,
  plate: UtensilsCrossed,
} as const;

export type IconName = keyof typeof glyphs;
export type IconSizeToken = keyof typeof IconSize;

interface IconProps {
  name: IconName;
  /** A token from the shared scale, or a raw number where a layout demands it. */
  size?: IconSizeToken | number;
  color?: string;
  /** Solid rather than outlined. Only meaningful for closed shapes: star, bookmark, flame, heart, circle. */
  filled?: boolean;
  /** Heavier stroke, for glyphs on a scarlet or ink ground where the fill eats the line. */
  emphasis?: boolean;
  /**
   * What a screen reader should say. Supply this only when the glyph carries
   * meaning no adjacent text already carries; leaving it off marks the icon
   * decorative and hides it from assistive tech, which is the right default for
   * an icon that merely repeats its own label.
   */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function Icon({
  name,
  size = 'md',
  color = Colors.ink,
  filled = false,
  emphasis = false,
  label,
  style,
}: IconProps) {
  const Glyph = glyphs[name];
  const px = typeof size === 'number' ? size : IconSize[size];

  // A labelled glyph is content and needs to be reachable; an unlabelled one is
  // decoration sitting next to text that already says the same thing, and
  // announcing it would just make the row read twice. iOS and Android spell
  // "skip this subtree" differently, so both flags go on.
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : Platform.OS === 'android'
      ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
      : { accessible: false, accessibilityElementsHidden: true };

  return (
    <Glyph
      size={px}
      color={color}
      strokeWidth={emphasis ? IconStroke.bold : IconStroke.regular}
      fill={filled ? color : 'none'}
      style={style}
      {...a11y}
    />
  );
}

/**
 * Nutrislice station names are free text typed by dining staff, so this matches
 * on substrings and falls back to the generic plate rather than guessing. The
 * station header is the thing students scan when hunting for the grill line, so
 * a mark that lands even half the time earns its place; a wrong mark would not,
 * hence the conservative default.
 */
export function stationIcon(stationName: string): IconName {
  const s = stationName.toLowerCase();
  if (s.includes('grill') || s.includes('coop')) return 'stationGrill';
  if (s.includes('salad') || s.includes('greens')) return 'stationSalad';
  if (s.includes('pizza') || s.includes('flatbread')) return 'stationPizza';
  if (s.includes('soup') || s.includes('stew')) return 'stationSoup';
  if (s.includes('deli') || s.includes('sandwich')) return 'stationDeli';
  if (s.includes('bakery') || s.includes('bread') || s.includes('pastry')) return 'stationBakery';
  if (s.includes('dessert') || s.includes('sweet')) return 'stationDessert';
  if (s.includes('vegan') || s.includes('vegetarian') || s.includes('plant')) return 'stationVegan';
  return 'stationMain';
}

/** Meal periods share one mapping so the tab strip, the log rows and the menu header never disagree. */
export function mealPeriodIcon(period: string): IconName {
  switch (period.toLowerCase()) {
    case 'breakfast':
      return 'breakfast';
    case 'dinner':
      return 'dinner';
    case 'coop':
      return 'coop';
    default:
      return 'lunch';
  }
}
