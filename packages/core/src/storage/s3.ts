import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

export const StorageEnvSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
});
export type StorageEnv = z.infer<typeof StorageEnvSchema>;

/** Where attachment bytes live. Tests pass an in-memory one. */
export type Storage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
};

/** S3-compatible storage (RustFS locally, R2/S3 in production). */
export function createS3Storage(env: StorageEnv): Storage & { ensureBucket(): Promise<void> } {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    // RustFS / MinIO style servers need path-style URLs (endpoint/bucket/key).
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const Bucket = env.S3_BUCKET;
  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        const body = await res.Body?.transformToByteArray();
        return body ? { body, contentType: res.ContentType ?? "application/octet-stream" } : null;
      } catch {
        return null;
      }
    },
  };
}

/** In-memory storage for tests. */
export function memoryStorage(): Storage {
  const files = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    async put(key, body, contentType) {
      files.set(key, { body, contentType });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
  };
}
