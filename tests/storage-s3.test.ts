import { DeleteObjectsCommand, GetObjectCommand, NoSuchKey, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3Driver } from "@/lib/storage/s3";

/** An S3Driver whose client keeps objects in memory, so the driver's own logic is what's tested. */
function memoryDriver() {
  const driver = new S3Driver("trustbrick-media", { region: "auto", endpoint: "https://example.r2.cloudflarestorage.com", accessKeyId: "x", secretAccessKey: "y", forcePathStyle: false });
  const objects = new Map<string, Buffer>();
  const sent: string[] = [];
  (driver as unknown as { client: { send: (c: unknown) => Promise<unknown> } }).client = {
    send: async (command: unknown) => {
      sent.push((command as object).constructor.name);
      if (command instanceof PutObjectCommand) {
        expect(command.input.Bucket).toBe("trustbrick-media");
        objects.set(command.input.Key!, command.input.Body as Buffer);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const body = objects.get(command.input.Key!);
        if (!body) throw new NoSuchKey({ message: "missing", $metadata: {} });
        return { ContentLength: body.byteLength, Body: { transformToWebStream: () => new Blob([new Uint8Array(body)]).stream() } };
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const o of command.input.Delete!.Objects!) objects.delete(o.Key!);
        return {};
      }
      throw new Error("unexpected command");
    },
  };
  return { driver, objects, sent };
}

describe("S3-compatible storage", () => {
  it("stores, reads and removes objects", async () => {
    const { driver, objects } = memoryDriver();
    expect(driver.provider).toBe("s3");
    await driver.put("properties/a/b/original.jpg", Buffer.from("photo-bytes"));
    const read = await driver.read("properties/a/b/original.jpg");
    expect(read?.size).toBe(11);
    expect(Buffer.from(await new Response(read!.stream).arrayBuffer()).toString()).toBe("photo-bytes");
    expect(await driver.read("properties/a/b/missing.jpg")).toBeNull();
    await driver.remove(["properties/a/b/original.jpg"]);
    expect(objects.size).toBe(0);
  });

  it("collects a stream before storing it", async () => {
    const { driver, objects } = memoryDriver();
    const { Readable } = await import("node:stream");
    await driver.putStream("k/streamed.bin", Readable.from([Buffer.from("ab"), "cd", Buffer.from("ef")]));
    expect(objects.get("k/streamed.bin")?.toString()).toBe("abcdef");
  });

  it("needs its settings", () => {
    const saved = { ...process.env };
    delete process.env.S3_BUCKET;
    expect(() => S3Driver.fromEnv()).toThrow(/S3_BUCKET/);
    process.env = saved;
  });
});
