/**
 * Seeds `equipment_csi_map` with canonical Division-26 (Electrical) category
 * to CSI section mappings. Rerunnable; uses UPSERT.
 *
 * The mapping is conservative: it lists the CSI sections where this category
 * is most commonly specified. Used by the retrieval layer to filter
 * spec_paragraphs by relevance to a given equipment tag.
 *
 * Source: MasterFormat 2020 Division 26.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const MAP: Array<{ category: string; csiSections: string[] }> = [
  // Service entrance
  { category: "service", csiSections: ["26 23 00", "26 05 00"] },
  // Main gear
  { category: "switchgear", csiSections: ["26 13 00", "26 23 00"] },
  // Distribution (bus, transformers, feeders)
  {
    category: "distribution",
    csiSections: ["26 22 00", "26 24 13", "26 24 16", "26 05 19"],
  },
  // Panelboards
  { category: "panel", csiSections: ["26 24 16"] },
  // Feeders (conductors + raceway + grounding)
  {
    category: "feeder",
    csiSections: ["26 05 19", "26 05 26", "26 05 33"],
  },
  // Branch loads (lighting, motors, receptacles)
  {
    category: "load",
    csiSections: ["26 27 26", "26 29 13", "26 51 00"],
  },
  // Protection + disconnects + overcurrent
  {
    category: "protection",
    csiSections: ["26 28 13", "26 28 16", "26 28 18"],
  },
  // Grounding + bonding
  { category: "grounding", csiSections: ["26 05 26"] },
  // Catch-all
  { category: "other", csiSections: [] },
];

async function main() {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not in .env.local");
  const sql = postgres(m[1], { max: 1 });
  try {
    for (const row of MAP) {
      await sql`
        insert into equipment_csi_map (category, csi_sections)
        values (${row.category}, ${row.csiSections})
        on conflict (category) do update
          set csi_sections = excluded.csi_sections
      `;
    }
    const count = await sql<{ n: number }[]>`
      select count(*)::int as n from equipment_csi_map
    `;
    console.log(`seeded equipment_csi_map: ${count[0].n} rows`);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
