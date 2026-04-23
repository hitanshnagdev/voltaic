import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

function requireEnv(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
} {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET in .env.local",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let _client: S3Client | undefined;
export function r2Client(): { client: S3Client; bucket: string } {
  const env = requireEnv();
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
  }
  return { client: _client, bucket: env.bucket };
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}) {
  const { client, bucket } = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  const { client, bucket } = r2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObjectStream(key: string) {
  const { client, bucket } = r2Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return res.Body;
}
