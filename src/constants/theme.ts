export const Colors = {
  // INK & TEXT
  ink: '#141414',
  textMuted: '#6B645C',
  textFaint: '#8A8178',
  textFainter: '#A8A199',
  textGhost: '#C9C1B6',
  inkSoft: '#4A443E',

  // BRAND
  scarlet: '#9E1B32',
  scarletBright: '#E23A50',
  gold: '#E8B84B',

  // SURFACES (light)
  cream: '#FBF8F3',
  canvas: '#EFEAE2',
  surface: '#FFFFFF',
  surfaceWarm: '#F3ECE0',
  track: '#F0E8DC',
  track2: '#EDE4D6',
  track3: '#E3D8C6',
  border: '#E1D9CD',
  borderSoft: '#E7DFD3',
  borderStrong: '#D5CCBE',

  // SURFACES (dark)
  darkBg: '#141414',
  darkSurface: '#1F1F1F',
  darkBorder: '#2E2E2E',
  darkElev1: '#23211F',
  darkElev2: '#1B1917',
  darkText: '#FBF8F3',
  darkTextDim: '#6E6862',

  // SYSTEM / ACCENTS
  amber: '#D97706',
  amberBg: '#FEF3C7',
  amberBorder: '#FDE68A',
  green: '#15803D',
  greenBg: '#DCFCE7',
} as const;

export const Radii = {
  pill: 999,
  xs: 6,
  sm: 10,
  md: 12,
  input: 14,
  btn: 16,
  card: 18,
  cardLg: 24,
  device: 44,
} as const;

export const Fonts = {
  outfit: {
    regular: 'Outfit_400Regular',
    medium: 'Outfit_500Medium',
    semiBold: 'Outfit_600SemiBold',
    bold: 'Outfit_700Bold',
    extraBold: 'Outfit_800ExtraBold',
  },
  mono: {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
  },
} as const;

export const Typography = {
  displayXL: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1.4,
  },
  displayL: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.9,
  },
  displayM: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 24,
    lineHeight: 27.6,
    letterSpacing: -0.72,
  },
  title: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 18,
    lineHeight: 23.4,
  },
  bodyL: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  body: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    lineHeight: 21.75,
  },
  bodyS: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 19.6,
  },
  bodySSemiBold: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    lineHeight: 19.6,
  },
  caption: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    lineHeight: 18.2,
  },
  micro: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 16.8,
  },
  monoLabel: {
    fontFamily: Fonts.mono.medium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
    color: Colors.textMuted,
  },
  monoUnit: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    color: Colors.textMuted,
  },
} as const;
