import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  Search,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react-native";
import { Colors, Typography } from "@/constants/theme";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useMenuStore } from "@/store/menuStore";
import { getTodayString } from "@/store/logStore";
import {
  dietaryFilters,
  discrepancies,
  macroKeys,
  scaleMacros,
  servingGrams,
  type NutritionReview,
} from "@/lib/nutritionReview";

async function invoke(body: object) {
  const { data, error } = await supabase.functions.invoke("review-nutrition", {
    body,
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function reasons(r: NutritionReview) {
  const grams = servingGrams(r.source.serving_size);
  return discrepancies(
    r.source,
    grams && r.candidates[0]
      ? scaleMacros(r.candidates[0].macros, grams)
      : null,
  );
}
function ReviewCard({
  row,
  refresh,
}: {
  row: NutritionReview;
  refresh: () => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(row.source.dish_name);
  const [candidateId, setCandidateId] = useState<number | null>(
    row.selected_candidate?.fdcId ?? null,
  );
  const [grams, setGrams] = useState(
    String(row.serving_grams ?? servingGrams(row.source.serving_size) ?? ""),
  );
  const [notes, setNotes] = useState(row.review_notes ?? "");
  const [evidence, setEvidence] = useState(row.dietary_evidence ?? "");
  const [tags, setTags] = useState(row.dietary_tags);
  const [basis, setBasis] = useState<"source" | "usda">(row.basis ?? "source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attested, setAttested] = useState(false);
  const candidate = row.candidates.find((c) => c.fdcId === candidateId);
  const validWeight =
    Number.isFinite(Number(grams)) &&
    Number(grams) > 0 &&
    Number(grams) <= 10000;
  const reference =
    candidate && validWeight
      ? scaleMacros(candidate.macros, Number(grams))
      : null;
  const flags = discrepancies(row.source, reference);
  const published = row.status === "approved";
  if (!expanded) {
    const weight = row.serving_grams ?? servingGrams(row.source.serving_size);
    const suggestion = row.selected_candidate ?? row.candidates[0];
    const comparison =
      suggestion && weight ? scaleMacros(suggestion.macros, weight) : null;
    const issues = reasons(row);
    return (
      <View style={s.card}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.food}>{row.source.dish_name}</Text>
            <Text style={s.muted}>
              {row.source.serving_size || "Serving weight needed"}
            </Text>
          </View>
          <View style={s.badge}>
            {published ? (
              <ShieldCheck size={17} color="#37745A" />
            ) : (
              <AlertTriangle size={17} color={Colors.amber} />
            )}
            <Text style={s.small}>
              {published
                ? "Published"
                : issues.length
                  ? `${issues.length} flags`
                  : "Needs review"}
            </Text>
          </View>
        </View>
        <View style={s.table}>
          <View style={s.row}>
            {macroKeys.map((k, i) => (
              <View key={k} style={{ flex: 1 }}>
                <Text style={s.small}>
                  {["Calories", "Protein", "Carbs", "Fat"][i]}
                </Text>
                <Text style={Typography.bodySSemiBold}>
                  {row.source[k] ?? "—"} →{" "}
                  {comparison?.[k] == null ? "—" : Math.round(comparison[k]!)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.small}>
            Dining → USDA per serving ·{" "}
            {published
              ? "Reviewed reference"
              : "Suggested reference, match unconfirmed"}
          </Text>
        </View>
        <Text style={s.small}>
          {row.lookup_error ||
            (!row.checked_at
              ? "USDA lookup queued"
              : !weight
                ? "Measured portion weight required"
                : !suggestion
                  ? "No USDA candidate — refine the search"
                  : suggestion.description)}
        </Text>
        <Button
          label={published ? "View published review" : "Compare & review"}
          variant="secondary"
          onPress={() => setExpanded(true)}
        />
      </View>
    );
  }
  async function action(publish: boolean) {
    setBusy(true);
    setError("");
    try {
      if (publish) {
        const { error } = await supabase.rpc("publish_nutrition_review", {
          p_key: row.source_key,
          p_candidate: candidateId,
          p_grams: Number(grams),
          p_basis: basis,
          p_notes: notes,
          p_tags: tags,
          p_evidence: evidence,
        });
        if (error) throw error;
        await useMenuStore.getState().refreshMenu();
      } else {
        await invoke({ source_key: row.source_key, query });
        setCandidateId(null);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <Button
        label="Collapse review"
        variant="ghost"
        onPress={() => setExpanded(false)}
      />
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.food}>{row.source.dish_name}</Text>
          <Text style={s.muted}>
            Dining portion: {row.source.serving_size || "Not supplied"}
          </Text>
        </View>
        <View style={[s.badge, published && { backgroundColor: "#E4EEE5" }]}>
          {published ? (
            <ShieldCheck size={15} color="#37745A" />
          ) : (
            <AlertTriangle size={15} color={Colors.amber} />
          )}
          <Text style={s.small}>
            {published ? "Published" : "Needs review"}
          </Text>
        </View>
      </View>
      <Text style={s.muted}>
        {row.source.ingredients ||
          "Ingredient list not supplied. Obtain recipe details before confirming a match."}
      </Text>
      <Text style={s.small}>
        Source labels: {row.source.dietary_tags?.join(" · ") || "None supplied"}{" "}
        · Allergens: {row.source.allergens?.join(", ") || "Not supplied"}
      </Text>
      {!published && (
        <>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            <Search size={18} color={Colors.textMuted} />
            <TextInput
              accessibilityLabel={`USDA search for ${row.source.dish_name}`}
              style={s.input}
              value={query}
              onChangeText={setQuery}
            />
            <Button
              label="Find USDA match"
              variant="secondary"
              loading={busy}
              onPress={() => void action(false)}
            />
          </View>
          <Text style={s.small}>
            Candidates are suggestions, per 100 g. Verify ingredients and
            preparation before selecting.
          </Text>
          {row.lookup_error && <Text style={s.error}>{row.lookup_error}</Text>}
          {!row.candidates.length && (
            <Text style={s.muted}>
              {row.checked_at
                ? "No USDA match found. Try a simpler ingredient or preparation name."
                : "Waiting for USDA lookup. Search now or run the next batch."}
            </Text>
          )}
        </>
      )}
      {row.candidates.map((c) => (
        <Pressable
          key={c.fdcId}
          disabled={published || busy}
          accessibilityRole="radio"
          accessibilityState={{ checked: candidateId === c.fdcId }}
          onPress={() => setCandidateId(c.fdcId)}
          style={[s.candidate, candidateId === c.fdcId && s.selected]}
        >
          <View style={{ flex: 1 }}>
            <Text style={Typography.bodySSemiBold}>{c.description}</Text>
            <Text style={s.small}>
              {c.dataType} · FDC {c.fdcId} · {c.macros.calories ?? "—"} kcal /
              100 g
            </Text>
          </View>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open USDA reference ${c.description}`}
            onPress={() =>
              void Linking.openURL(
                `https://fdc.nal.usda.gov/food-details/${c.fdcId}/nutrients`,
              )
            }
          >
            <ExternalLink size={18} color={Colors.scarlet} />
          </Pressable>
        </Pressable>
      ))}
      <View style={s.row}>
        <Text style={[s.muted, { flex: 1 }]}>
          Weight of one dining serving (g)
        </Text>
        <TextInput
          accessibilityLabel="Serving weight in grams"
          editable={!published}
          keyboardType="decimal-pad"
          value={grams}
          onChangeText={setGrams}
          style={[s.input, { flex: 0, width: 125 }]}
        />
      </View>
      {!validWeight && (
        <Text style={s.warning}>
          A cup, bowl, or piece needs a measured gram weight before comparison.
        </Text>
      )}
      <View style={s.table}>
        <View style={s.row}>
          {["Nutrient", "Dining", "USDA", "Difference"].map((x) => (
            <Text key={x} style={s.cellLabel}>
              {x}
            </Text>
          ))}
        </View>
        {macroKeys.map((k, i) => {
          const original = row.source[k],
            value = reference?.[k];
          const delta =
            original != null && value != null ? original - value : null;
          return (
            <View style={s.tableRow} key={k}>
              <Text style={s.cell}>
                {["Calories", "Protein (g)", "Carbs (g)", "Fat (g)"][i]}
              </Text>
              <Text style={s.cell}>{original ?? "—"}</Text>
              <Text style={s.cell}>
                {value == null ? "—" : value.toFixed(1)}
              </Text>
              <Text
                style={[
                  s.cell,
                  delta != null &&
                    Math.abs(delta) >
                      Math.max(i ? 5 : 50, (value ?? 0) * 0.25) && {
                      color: Colors.scarlet,
                    },
                ]}
              >
                {delta == null
                  ? "—"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
              </Text>
            </View>
          );
        })}
      </View>
      {flags.map((f) => (
        <Text key={f} style={s.warning}>
          • {f}
        </Text>
      ))}
      {!flags.length && (
        <Text style={s.muted}>
          {reference
            ? "No large discrepancies at this serving weight. A reviewer must still confirm the match."
            : "No internal macro inconsistencies detected. Select a reference to compare."}
        </Text>
      )}
      <View style={s.row}>
        {(["source", "usda"] as const).map((b) => (
          <Pressable
            disabled={published}
            key={b}
            accessibilityRole="radio"
            accessibilityState={{ checked: basis === b }}
            style={[s.choice, basis === b && s.selected]}
            onPress={() => setBasis(b)}
          >
            <Text style={Typography.bodySSemiBold}>
              {b === "source" ? "Keep dining values" : "Use USDA estimate"}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Public review notes and serving evidence"
        editable={!published}
        placeholder="Explain the food match, preparation, and serving-weight evidence. These notes appear in the app."
        multiline
        style={[s.input, s.notes]}
        value={notes}
        onChangeText={setNotes}
      />
      <Text style={Typography.bodySSemiBold}>Documented dietary labels</Text>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {dietaryFilters.map((t) => (
          <Pressable
            disabled={published}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: tags.includes(t) }}
            key={t}
            onPress={() =>
              setTags(
                tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t],
              )
            }
            style={[s.badge, tags.includes(t) && s.selected]}
          >
            <Text style={s.small}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Dietary certification evidence"
        editable={!published}
        placeholder="Certification or dining-service evidence for selected labels (visible in app)"
        multiline
        style={[s.input, s.notes]}
        value={evidence}
        onChangeText={setEvidence}
      />
      {!published && (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: attested }}
            onPress={() => setAttested(!attested)}
            style={s.row}
          >
            <View style={[s.checkbox, attested && s.selected]}>
              <Text>{attested ? "✓" : ""}</Text>
            </View>
            <Text style={[s.muted, { flex: 1 }]}>
              I checked the food, preparation, portion weight, and evidence for
              any dietary labels.
            </Text>
          </Pressable>
          <Button
            label="Confirm & publish nutrition"
            icon={<ArrowRight size={18} color="white" />}
            loading={busy}
            disabled={
              !attested ||
              !candidate ||
              !validWeight ||
              notes.trim().length < 12 ||
              (tags.length > 0 && evidence.trim().length < 12) ||
              macroKeys.some(
                (k) =>
                  (basis === "source" ? row.source[k] : reference?.[k]) == null,
              )
            }
            onPress={() => void action(true)}
          />
        </>
      )}
      {published && (
        <Text style={s.muted}>
          Published {new Date(row.reviewed_at!).toLocaleString()}. A source
          change automatically opens a new review.
        </Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export default function NutritionReviewPage() {
  const [date, setDate] = useState(getTodayString());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Needs review");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const q = useQuery({
    queryKey: ["admin", "nutrition", date],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviewed_menu_items")
        .select("nutrition_review")
        .eq("served_date", date)
        .order("dish_name");
      if (error) throw error;
      const unique = new Map<string, NutritionReview>();
      for (const item of data ?? []) {
        const r = item.nutrition_review as unknown as NutritionReview;
        if (r) unique.set(r.source_key, r);
      }
      return [...unique.values()];
    },
  });
  const rows = q.data ?? [];
  const counts = [
    rows.filter((r) => r.status !== "approved").length,
    rows.filter((r) => reasons(r).length > 0).length,
    rows.filter((r) => r.status === "approved").length,
  ];
  const shown = rows.filter(
    (r) =>
      `${r.source.dish_name} ${r.source.ingredients ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All foods" ||
        (filter === "Published"
          ? r.status === "approved"
          : filter === "Flagged"
            ? reasons(r).length > 0
            : r.status !== "approved")),
  );
  async function batch() {
    setBusy(true);
    setMessage("");
    try {
      const result = await invoke({ action: "batch" });
      setMessage(
        `Checked ${result.checked} food versions${result.failed ? `; ${result.failed} failed — see review details` : ""}. Batches also run after each menu sync.`,
      );
      await q.refetch();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.eyebrow}>NUTRITION WORKSPACE</Text>
      <Text style={s.title}>Confidence in every serving.</Text>
      <Text style={s.subtitle}>
        Compare dining-service nutrition with USDA references. Confirm the
        portion and food match, then publish the reviewed values and evidence to
        the app.
      </Text>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {["Needs review", "Flagged", "Published"].map((t, i) => (
          <Pressable
            key={t}
            onPress={() => setFilter(t)}
            style={[s.stat, filter === t && s.selected]}
          >
            <Text style={s.statNumber}>{counts[i]}</Text>
            <Text style={s.muted}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        <TextInput
          accessibilityLabel="Menu date YYYY-MM-DD"
          value={date}
          onChangeText={setDate}
          style={[s.input, { flex: 0, width: 160 }]}
        />
        <TextInput
          accessibilityLabel="Search foods or ingredients"
          placeholder="Search foods or ingredients…"
          value={search}
          onChangeText={setSearch}
          style={s.input}
        />
        <Button
          label="Check next 8 foods"
          variant="secondary"
          loading={busy}
          onPress={() => void batch()}
        />
      </View>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {["Needs review", "Flagged", "Published", "All foods"].map((f) => (
          <Pressable
            key={f}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f }}
            style={[s.badge, filter === f && s.selected]}
            onPress={() => setFilter(f)}
          >
            <Text style={s.small}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.small}>
        Flags use a 25% difference with minimums of 50 kcal or 5 g. Automatic
        USDA comparisons use the first suggested match and known serving weight;
        they are review prompts, not proof of an error.
      </Text>
      {!!message && <Text style={s.warning}>{message}</Text>}
      {q.isLoading ? (
        <ActivityIndicator color={Colors.scarlet} />
      ) : q.error ? (
        <View style={s.card}>
          <Text style={s.error}>{q.error.message}</Text>
          <Button label="Retry" onPress={() => void q.refetch()} />
        </View>
      ) : (
        shown.map((r) => (
          <ReviewCard key={r.source_key} row={r} refresh={q.refetch} />
        ))
      )}
      {!q.isLoading && !q.error && !shown.length && (
        <View style={s.card}>
          <ShieldCheck size={32} color="#37745A" />
          <Text style={s.food}>No foods in this view.</Text>
          <Text style={s.muted}>
            Choose another date, clear your search, or switch to All foods.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: {
    padding: 28,
    gap: 18,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 80,
  },
  eyebrow: { ...Typography.monoLabel, color: Colors.scarlet },
  title: { ...Typography.displayM, fontSize: 36 },
  subtitle: { ...Typography.body, color: Colors.textMuted, maxWidth: 760 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  stat: {
    flex: 1,
    minWidth: 130,
    padding: 20,
    backgroundColor: "#F7F3EB",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  statNumber: { ...Typography.displayM, fontSize: 32 },
  card: {
    padding: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: "#FFFDF8",
    gap: 16,
  },
  food: { ...Typography.title, fontSize: 23 },
  muted: { ...Typography.bodyS, color: Colors.textMuted },
  small: { ...Typography.caption, color: Colors.inkSoft },
  badge: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#F2EDE3",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: { backgroundColor: "#E7EFE7", borderColor: "#6F927A" },
  input: {
    ...Typography.bodyS,
    flex: 1,
    minWidth: 90,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 13,
    color: Colors.ink,
  },
  notes: { minHeight: 80, flex: 0, textAlignVertical: "top" },
  candidate: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
  },
  table: { backgroundColor: "#F7F3EB", borderRadius: 16, padding: 16, gap: 12 },
  tableRow: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSoft,
    paddingTop: 12,
  },
  cell: { ...Typography.bodyS, flex: 1 },
  cellLabel: { ...Typography.caption, flex: 1, color: Colors.textMuted },
  choice: {
    flex: 1,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    borderRadius: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  warning: { ...Typography.bodyS, color: "#8A551B" },
  error: { ...Typography.bodyS, color: Colors.scarlet },
});
