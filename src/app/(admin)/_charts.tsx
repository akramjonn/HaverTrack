import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Redirect } from 'expo-router';
import Svg, { Path, Line, Circle, Polyline } from 'react-native-svg';
import { CheckCircle2, AlertTriangle, XCircle, Minus } from 'lucide-react-native';
import { Colors, Fonts, Typography, Radii } from '@/constants/theme';
import { compactNumber, type Severity } from '@/lib/admin';

/**
 * Chart primitives for the admin console, built on react-native-svg.
 *
 * Shared specs (kept identical across every chart here so the console reads as
 * one system): bars cap at 24px thick with a 4px rounded data-end and a square
 * baseline, lines are 2px, gridlines are hairline and recessive, and touching
 * marks are separated by a 2px gap in the surface colour rather than a stroke.
 *
 * Every state is encoded in form as well as colour — severity ships as an icon
 * plus a word, and single-series charts carry direct labels instead of relying
 * on hue.
 */

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const ChartColors = {
  /** The one accent. Single-series charts are always this against `track`. */
  primary: Colors.scarlet,
  /** De-emphasis: empty days, unselected bars, sparkline context. */
  track: Colors.track3,
  grid: Colors.borderSoft,
  surface: Colors.surface,

  /**
   * Categorical trio for the log-source mix, in fixed order (never cycled).
   * Validated against the #FFFFFF card surface: lightness band, chroma floor,
   * normal-vision separation and 3:1 contrast all pass; worst CVD pair is
   * ΔE 6.5 (protan), which is legal here because the mix always ships with a
   * legend, 2px surface gaps between segments and a numeric readout.
   */
  scan: '#9E1B32',
  menu: '#B8801A',
  manual: '#15803D',
} as const;

const SEVERITY_STYLE: Record<
  Severity,
  { fg: string; bg: string; border: string; Icon: typeof CheckCircle2 }
> = {
  good: { fg: Colors.green, bg: Colors.greenBg, border: '#BBF7D0', Icon: CheckCircle2 },
  warning: { fg: Colors.amber, bg: Colors.amberBg, border: Colors.amberBorder, Icon: AlertTriangle },
  critical: { fg: Colors.scarlet, bg: '#FBEAED', border: 'rgba(158,27,50,0.28)', Icon: XCircle },
  neutral: { fg: Colors.textMuted, bg: Colors.surfaceWarm, border: Colors.borderSoft, Icon: Minus },
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Bar with a rounded data-end and a square baseline, growing upward. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Bar with a rounded data-end and a square baseline, growing rightward. */
function rowPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h / 2, w);
  if (w <= 0) return '';
  return [
    `M${x},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `L${x},${y + h}`,
    'Z',
  ].join(' ');
}

/** Measures the container so charts size themselves to whatever card holds them. */
export function useMeasuredWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);
  return [width, onLayout];
}

// ---------------------------------------------------------------------------
// Severity chip — icon + word + colour, never colour alone
// ---------------------------------------------------------------------------

export function SeverityChip({
  severity,
  label,
  style,
}: {
  severity: Severity;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = SEVERITY_STYLE[severity];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}, status ${severity}`}
      style={[
        styles.severityChip,
        { backgroundColor: s.bg, borderColor: s.border },
        style,
      ]}
    >
      <s.Icon size={13} color={s.fg} />
      <Text style={[styles.severityText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  severity,
  severityLabel,
  spark,
  style,
}: {
  label: string;
  value: string | number;
  hint?: string;
  severity?: Severity;
  severityLabel?: string;
  /** 12-ish point context series; the last point is drawn in the accent. */
  spark?: number[];
  style?: StyleProp<ViewStyle>;
}) {
  const display = typeof value === 'number' ? compactNumber(value) : value;
  return (
    <View style={[styles.tile, style]}>
      <Text style={Typography.monoLabel} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {display}
      </Text>
      {hint ? (
        <Text style={styles.tileHint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
      {severity && severityLabel ? (
        <SeverityChip severity={severity} label={severityLabel} style={{ marginTop: 8 }} />
      ) : null}
      {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

export function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const [width, onLayout] = useMeasuredWidth();
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  return (
    <View onLayout={onLayout} style={{ marginTop: 10, height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Polyline
            points={values
              .map((v, i) => {
                const x = (i / (values.length - 1)) * (width - 6) + 3;
                const y = height - 3 - ((v - min) / span) * (height - 6);
                return `${x},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke={ChartColors.track}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle
            cx={width - 3}
            cy={height - 3 - ((values[values.length - 1] - min) / span) * (height - 6)}
            r={4}
            fill={ChartColors.primary}
            stroke={ChartColors.surface}
            strokeWidth={2}
          />
        </Svg>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Column chart — one series over time
// ---------------------------------------------------------------------------

export interface ColumnDatum {
  label: string;
  value: number;
  /** Marks this column as the emphasised one; the rest fall back to `track`. */
  emphasis?: boolean;
}

export function ColumnChart({
  data,
  height = 120,
  /** How many x labels to show; the rest are dropped rather than overlapped. */
  maxLabels = 7,
  valueSuffix = '',
  emphasisOnly = false,
}: {
  data: ColumnDatum[];
  height?: number;
  maxLabels?: number;
  valueSuffix?: string;
  /** When true, only the `emphasis` columns take the accent (peak-hours style). */
  emphasisOnly?: boolean;
}) {
  const [width, onLayout] = useMeasuredWidth();
  const max = Math.max(...data.map((d) => d.value), 1);
  const labelStride = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && data.length > 0 ? (
          <Svg width={width} height={height}>
            {/* Recessive baseline — the only rule the chart needs. */}
            <Line
              x1={0}
              y1={height - 0.5}
              x2={width}
              y2={height - 0.5}
              stroke={ChartColors.grid}
              strokeWidth={1}
            />
            {data.map((d, i) => {
              const slot = width / data.length;
              const barW = Math.max(1.5, Math.min(24, slot - (slot > 6 ? 2 : 1)));
              const x = i * slot + (slot - barW) / 2;
              const h = (d.value / max) * (height - 6);
              const accent = emphasisOnly ? !!d.emphasis : d.value > 0;
              return (
                <Path
                  key={i}
                  d={columnPath(x, height - h, barW, h)}
                  fill={accent ? ChartColors.primary : ChartColors.track}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axisRow}>
        {data.map((d, i) => (
          <Text key={i} style={styles.axisLabel} numberOfLines={1}>
            {i % labelStride === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
      <Text style={styles.axisNote}>
        Peak {compactNumber(max)}
        {valueSuffix}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stacked column chart — the log-source mix
// ---------------------------------------------------------------------------

export interface StackSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export function StackedColumnChart({
  labels,
  series,
  height = 120,
  maxLabels = 7,
}: {
  labels: string[];
  series: StackSeries[];
  height?: number;
  maxLabels?: number;
}) {
  const [width, onLayout] = useMeasuredWidth();
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const labelStride = Math.max(1, Math.ceil(labels.length / maxLabels));
  const seriesTotals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
  const grandTotal = seriesTotals.reduce((a, b) => a + b, 0);

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && labels.length > 0 ? (
          <Svg width={width} height={height}>
            <Line
              x1={0}
              y1={height - 0.5}
              x2={width}
              y2={height - 0.5}
              stroke={ChartColors.grid}
              strokeWidth={1}
            />
            {labels.map((_, i) => {
              const slot = width / labels.length;
              const barW = Math.max(1.5, Math.min(24, slot - (slot > 6 ? 2 : 1)));
              const x = i * slot + (slot - barW) / 2;
              let cursor = height;
              const usable = height - 6;
              return series.map((s, si) => {
                const raw = ((s.values[i] ?? 0) / max) * usable;
                if (raw <= 0) return null;
                // 2px of surface between touching segments does the separating;
                // never a stroke, which would add ink that is not data.
                const gap = si === 0 ? 0 : 2;
                const h = Math.max(1, raw - gap);
                const y = cursor - h;
                cursor = y - gap;
                const isTop = series.slice(si + 1).every((rest) => (rest.values[i] ?? 0) <= 0);
                return (
                  <Path
                    key={`${i}-${s.key}`}
                    d={
                      isTop
                        ? columnPath(x, y, barW, h)
                        : `M${x},${y} L${x + barW},${y} L${x + barW},${y + h} L${x},${y + h} Z`
                    }
                    fill={s.color}
                  />
                );
              });
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axisRow}>
        {labels.map((label, i) => (
          <Text key={i} style={styles.axisLabel} numberOfLines={1}>
            {i % labelStride === 0 ? label : ''}
          </Text>
        ))}
      </View>
      {/* Legend is always present for ≥2 series, and carries the numbers so the
          mix is readable without matching colours at all. */}
      <View style={styles.legendRow}>
        {series.map((s, i) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>
              {s.label}{' '}
              <Text style={styles.legendValue}>
                {grandTotal ? Math.round((seriesTotals[i] / grandTotal) * 100) : 0}%
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar list — funnel steps, top dishes, top stations
// ---------------------------------------------------------------------------

export interface RowDatum {
  key: string;
  label: string;
  value: number;
  /** Secondary text on the right, e.g. "62% of signups" or "9 students". */
  meta?: string;
}

export function RowBarChart({
  data,
  barHeight = 12,
  /** Scale against this instead of the largest row (funnels scale to step 1). */
  scaleMax,
  showRank = false,
}: {
  data: RowDatum[];
  barHeight?: number;
  scaleMax?: number;
  showRank?: boolean;
}) {
  const [width, onLayout] = useMeasuredWidth();
  const max = Math.max(scaleMax ?? 0, ...data.map((d) => d.value), 1);

  return (
    <View onLayout={onLayout}>
      {data.map((d, i) => (
        <View key={d.key} style={styles.rowBarBlock}>
          <View style={styles.rowBarHeader}>
            <Text style={styles.rowBarLabel} numberOfLines={1}>
              {showRank ? `${i + 1}. ` : ''}
              {d.label}
            </Text>
            <Text style={styles.rowBarValue}>{compactNumber(d.value)}</Text>
          </View>
          {width > 0 ? (
            <Svg width={width} height={barHeight}>
              <Path
                d={rowPath(0, 0, width, barHeight)}
                fill={ChartColors.track}
                opacity={0.55}
              />
              <Path
                d={rowPath(0, 0, Math.max(0, (d.value / max) * width), barHeight)}
                fill={ChartColors.primary}
              />
            </Svg>
          ) : null}
          {d.meta ? <Text style={styles.rowBarMeta}>{d.meta}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state — an honest blank beats a chart of zeros
// ---------------------------------------------------------------------------

export function ChartEmpty({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  severityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  severityText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
  },
  tile: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  tileValue: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: Colors.ink,
    marginTop: 4,
  },
  tileHint: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: 2,
  },
  axisRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  axisLabel: {
    ...Typography.monoUnit,
    flex: 1,
    textAlign: 'center',
  },
  axisNote: {
    ...Typography.monoUnit,
    marginTop: 6,
    textAlign: 'right',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: 6,
  },
  legendLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  legendValue: {
    fontFamily: Fonts.mono.medium,
    fontSize: 11,
    color: Colors.ink,
  },
  rowBarBlock: {
    marginBottom: 14,
  },
  rowBarHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  rowBarLabel: {
    ...Typography.bodyS,
    color: Colors.ink,
    flex: 1,
    marginRight: 10,
  },
  rowBarValue: {
    fontFamily: Fonts.mono.medium,
    fontSize: 13,
    color: Colors.ink,
  },
  rowBarMeta: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: 4,
  },
  empty: {
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyText: {
    ...Typography.bodyS,
    color: Colors.textFaint,
    textAlign: 'center',
  },
});

/**
 * Everything under `src/app` is a route to expo-router, including this module of
 * shared components. It has nothing to render, so it bounces to the console
 * rather than sitting in the stack as a blank screen.
 */
export default function AdminChartsModuleRoute() {
  return <Redirect href={'/(admin)' as never} />;
}
