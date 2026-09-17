import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors, Typography } from '@/constants/theme';
import type { ParsedMenuItem } from '@/lib/nutrislice';
import { menuDays, shiftMenuDay } from '@/lib/menuDates';

export function MenuDayPicker({ items, today, value, onChange }: { items: ParsedMenuItem[]; today: string; value: string; onChange: (day: string) => void }) {
  const days = menuDays(items, today, value);
  const posted = new Set(items.filter(i => i.availability !== 'unavailable').map(i => i.served_date));
  const scroll = useRef<ScrollView>(null);
  const selectedIndex = days.indexOf(value);
  useEffect(() => { scroll.current?.scrollTo({ x: Math.max(0, selectedIndex - 1) * 92, animated: true }); }, [selectedIndex]);
  return <View style={s.container}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous menu day" onPress={() => onChange(shiftMenuDay(value, -1))} style={s.arrow}><ChevronLeft size={20} color={Colors.ink} /></Pressable>
      <Text style={Typography.bodySSemiBold}>{new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next menu day" onPress={() => onChange(shiftMenuDay(value, 1))} style={s.arrow}><ChevronRight size={20} color={Colors.ink} /></Pressable>
    </View>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days} onContentSizeChange={() => scroll.current?.scrollTo({ x: Math.max(0, days.indexOf(value) - 1) * 92, animated: false })}>
      {days.map(day => <Pressable key={day} accessibilityRole="tab" accessibilityLabel={`${day}${posted.has(day) ? ', menu posted' : ', menu not posted yet'}`} accessibilityState={{ selected: day === value }} onPress={() => onChange(day)} style={[s.day, day === value && s.active]}>
        <Text style={[s.label, day === value && s.activeText]}>{day === today ? 'Today' : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' })}</Text>
        <Text style={[s.number, day === value && s.activeText]}>{Number(day.slice(-2))}</Text>
        <Text style={[s.status, day === value && s.activeText]}>{posted.has(day) ? 'Posted' : 'Not posted'}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({ container: { gap: 10 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, arrow: { padding: 12 }, days: { gap: 8 }, day: { width: 84, paddingVertical: 12, borderRadius: 16, alignItems: 'center', gap: 5, backgroundColor: Colors.surfaceWarm, borderWidth: 1, borderColor: Colors.borderSoft }, active: { backgroundColor: Colors.ink, borderColor: Colors.ink }, activeText: { color: 'white' }, label: { ...Typography.caption, color: Colors.ink }, number: { ...Typography.title, fontSize: 23 }, status: { ...Typography.micro, color: Colors.textMuted } });
