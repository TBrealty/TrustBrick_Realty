import "server-only";
import { DeleteObjectsCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageDriver } from "./index";

/**
 * S3-compatible object storage: Amazon S3, Cloudflare R2, MinIO and the like. Objects stay
 * private in the bucket; the /media route reads them and decides who may see each one, so
 * documents and virtual tours keep their access checks.
 *
 * STORAGE_DRIVER=s3 with S3_BUCKET, and S3_REGION ("auto" for R2) or S3_ENDPOINT
 * (R2: https://<account>.r2.cloudflarestorage.com). S3_FORCE_PATH_STYLE=true for MinIO.
 * S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are needed except on AWS, where they can be left out
 * and the server's IAM role is used (EC2 instance profile).
 */
export class S3Driver implements StorageDriver {
  readonly provider = "s3" as const;
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: { region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean },
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      // Without keys, the SDK's default chain applies (the EC2 server's IAM role).
      credentials: config.accessKeyId && config.secretAccessKey ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } : undefined,
    });
  }

  static fromEnv(): S3Driver {
    const need = (name: string) => {
      const value = process.env[name];
      if (!value) throw new Error(`STORAGE_DRIVER=s3 needs ${name}. See lib/storage/s3.ts.`);
      return value;
    };
    return new S3Driver(need("S3_BUCKET"), {
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
  }

  async put(key: string, body: Buffer) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentLength: body.byteLength }));
  }

  async putStream(key: string, body: NodeJS.ReadableStream) {
    // Uploads are capped well under S3's single-request limit, so a buffer keeps this simple.
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
    await this.put(key, Buffer.concat(chunks));
  }

  async read(key: string) {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) return null;
      return { stream: object.Body.transformToWebStream() as ReadableStream, size: Number(object.ContentLength ?? 0) };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string })?.name === "NoSuchKey") return null;
      throw error;
    }
  }

  async remove(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
    }
  }
}
