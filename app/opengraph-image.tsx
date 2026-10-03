import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = site.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const photo = await readFile(path.join(process.cwd(), "public/images/hero/hero-skyline-dusk.jpg"));
  const src = `data:image/jpeg;base64,${photo.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#0d1119" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser */}
        <img src={src} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            backgroundImage: "linear-gradient(90deg, rgba(13,17,25,0.9) 0%, rgba(13,17,25,0.55) 55%, rgba(13,17,25,0.25) 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: "100%", color: "#f8f6f1" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>Trustbrick</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 88, lineHeight: 1, letterSpacing: -3, maxWidth: 820 }}>Real estate, built on trust.</div>
            <div style={{ marginTop: 28, fontSize: 28, color: "rgba(248,246,241,0.72)", maxWidth: 760 }}>
              Discover, evaluate and move through real estate with greater confidence.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
