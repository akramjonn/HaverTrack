import assert from "node:assert/strict";
import type { Client } from "pg";
export async function testNutritionDatabase(
  db: Client,
  admin: string,
  student: string,
) {
  await db.query("reset role");
  const {
    rows: [menu],
  } =
    await db.query(`insert into public.menu_items(nutrislice_id,location_id,meal_period,served_date,station_name,dish_name,ingredients,serving_size,calories,protein_g,carbs_g,fat_g)
    values(987654,'dining-location','lunch',current_date,'Test','Test rice','Rice, water','100 g',900,2,20,1) returning id,nutrition_source_key`);
  const candidates = [
    {
      fdcId: 123,
      description: "Cooked rice",
      dataType: "Foundation",
      macros: { calories: 100, protein_g: 2, carbs_g: 20, fat_g: 1 },
    },
  ];
  await db.query(
    `update public.nutrition_reviews set candidates=$1 where source_key=$2`,
    [JSON.stringify(candidates), menu.nutrition_source_key],
  );
  const login = async (id: string, role = "authenticated") => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.query(`set role ${role}`);
  };
  const denied = async (sql: string, args: unknown[] = []) => {
    await assert.rejects(db.query(sql, args));
  };
  const publish = `select public.publish_nutrition_review($1,123,$2,'usda','Matched cooked rice, weighed serving in grams',$3,$4)`;
  await login(student);
  await denied(`update public.nutrition_reviews set status='approved'`);
  await denied(
    `insert into public.nutrition_reviews(source_key,source) values('fake','{}')`,
  );
  await denied(`delete from public.nutrition_reviews`);
  await denied(publish, [menu.nutrition_source_key, 150, [], ""]);
  assert.equal(
    (
      await db.query(
        "select calories from public.reviewed_menu_items where id=$1",
        [menu.id],
      )
    ).rows[0].calories,
    900,
  );
  await login("", "anon");
  await denied(`select * from public.nutrition_reviews`);
  await denied(`select * from public.reviewed_menu_items`);
  await denied(publish, [menu.nutrition_source_key, 150, [], ""]);
  await login(admin);
  await denied(publish, [menu.nutrition_source_key, null, [], ""]);
  await denied(publish, [menu.nutrition_source_key, 150, ["Halal"], ""]);
  await db.query(publish, [
    menu.nutrition_source_key,
    150,
    ["Halal"],
    "Dining certification checked by reviewer",
  ]);
  await login(student);
  const published = (
    await db.query("select * from public.reviewed_menu_items where id=$1", [
      menu.id,
    ])
  ).rows[0];
  assert.equal(published.calories, 150);
  assert.equal(Number(published.protein_g), 3);
  assert.ok(published.dietary_tags.includes("Halal"));
  assert.equal(published.nutrition_review.status, "approved");
  await login(admin);
  await db.query(publish, [menu.nutrition_source_key, 150, [], ""]);
  assert.deepEqual(
    (
      await db.query(
        "select dietary_tags from public.reviewed_menu_items where id=$1",
        [menu.id],
      )
    ).rows[0].dietary_tags,
    [],
  );
  await db.query("reset role");
  assert.equal(
    (
      await db.query("select calories from public.menu_items where id=$1", [
        menu.id,
      ])
    ).rows[0].calories,
    900,
  );
  await db.query("update public.menu_items set synced_at=now() where id=$1", [
    menu.id,
  ]);
  assert.equal(
    (
      await db.query(
        "select calories from public.reviewed_menu_items where id=$1",
        [menu.id],
      )
    ).rows[0].calories,
    150,
  );
  await db.query(
    "update public.menu_items set ingredients='Rice, butter' where id=$1",
    [menu.id],
  );
  const changed = (
    await db.query("select * from public.reviewed_menu_items where id=$1", [
      menu.id,
    ])
  ).rows[0];
  assert.equal(changed.calories, 900);
  assert.equal(changed.nutrition_review.status, "pending");
  assert.ok(!changed.dietary_tags.includes("Halal"));
  await login(admin);
  await denied(publish, [menu.nutrition_source_key, 150, [], ""]);
  await db.query("reset role");
  console.log(
    "PASS: nutrition read/write authorization, approval evidence, scaled publishing, raw preservation, sync persistence, and source-change invalidation",
  );
  const syncedItem = { nutrislice_id: 987655, location_id: 'dining-location', meal_period: 'lunch', served_date: '2035-01-01', station_name: 'Main Line', station_id: 1, dish_name: 'Corned Beef Griller', source_order: 0, calories: 400, protein_g: 30, carbs_g: 20, fat_g: 20, dietary_tags: [], allergens: [], synced_at: new Date().toISOString() };
  const sync = async () => db.query('select public.apply_haverford_menu_sync(gen_random_uuid(),now(),$1,$2)', [JSON.stringify([syncedItem]), JSON.stringify([{served_date: syncedItem.served_date,meal_period:'lunch'}])]);
  await sync();
  const row = (await db.query('select * from public.reviewed_menu_items where nutrislice_id=987655')).rows[0];
  assert.equal(row.source_order, 0);
  syncedItem.source_order = 2;
  await sync();
  const reordered = (await db.query('select * from public.reviewed_menu_items where nutrislice_id=987655')).rows[0];
  assert.equal(reordered.source_order, 2);
  assert.equal(reordered.nutrition_source_key, row.nutrition_source_key);
  console.log('PASS: source ordering survives sync, updates, and reviewed menu projection without invalidating nutrition');
}
