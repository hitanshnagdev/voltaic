import {
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { documents } from "../lib/db/schema";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client);

  const rows = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.uploadedAt))
    .limit(5);
  console.log("documents rows:", rows.length);
  for (const r of rows) {
    console.log(
      `  ${r.filename}  type=${r.docType ?? "null"}  size=${r.sizeBytes}  key=${r.r2Key}`,
    );
  }
  await client.end();

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET!, MaxKeys: 10 }),
  );
  console.log(
    `\nR2 bucket "${process.env.R2_BUCKET}" objects: ${listed.KeyCount ?? 0}`,
  );
  for (const o of listed.Contents ?? []) {
    console.log(`  ${o.Key}  (${o.Size} bytes)`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
