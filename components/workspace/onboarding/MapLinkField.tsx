"use client";

import { useEffect, useId, useRef, useState } from "react";
import { previewMapLinkAction } from "@/app/(workspace)/properties/actions";
import { MAP_LINK_MESSAGES, type Pin, googleMapsLink, parseMapLink } from "@/lib/listings/map-link";

type Status = { kind: "empty" } | { kind: "checking" } | { kind: "found"; pin: Pin } | { kind: "error"; message: string };

function localStatus(link: string): Status | "ask-server" {
  if (!link.trim()) return { kind: "empty" };
  const r = parseMapLink(link);
  if (r.ok) return { kind: "found", pin: r.pin };
  return r.reason === "short_link" ? "ask-server" : { kind: "error", message: MAP_LINK_MESSAGES[r.reason] };
}

/**
 * The property's map pin, from a Google Maps or Apple Maps link. The pin is read as the agent
 * pastes (short links are checked on the server) and shown on a small map to confirm. Blank
 * means the locality's centre is used, and the reviewer sees the pin is approximate.
 */
export function MapLinkField({ defaultValue = "", error }: { defaultValue?: string; error?: string }) {
  const id = useId();
  const [link, setLink] = useState(defaultValue);
  const [status, setStatus] = useState<Status>(() => {
    const s = localStatus(defaultValue);
    return s === "ask-server" ? { kind: "checking" } : s;
  });
  const [locating, setLocating] = useState<"idle" | "busy" | "error">("idle");
  const latest = useRef(0);

  // Short links can only be read on the server; ask once the agent stops typing.
  useEffect(() => {
    if (localStatus(link) !== "ask-server") return;
    const ticket = ++latest.current;
    const t = setTimeout(async () => {
      const r = await previewMapLinkAction(link.trim());
      if (ticket !== latest.current) return;
      setStatus(r.ok ? { kind: "found", pin: r.data! } : { kind: "error", message: r.code === "RATE_LIMITED" ? "Too many checks. Save, and the link is checked then." : r.message });
    }, 400);
    return () => clearTimeout(t);
  }, [link]);

  const change = (value: string) => {
    setLink(value);
    const s = localStatus(value);
    setStatus(s === "ask-server" ? { kind: "checking" } : s);
  };

  const locate = () => {
    if (!navigator.geolocation) return setLocating("error");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        change(googleMapsLink({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setLocating("idle");
      },
      () => setLocating("error"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const shown = error && status.kind !== "found" ? error : status.kind === "error" ? status.message : null;
  const pin = status.kind === "found" ? status.pin : null;
  const d = 0.004;

  return (
    <fieldset className="rounded-[3px] border border-line-light p-4">
      <legend className="px-1 text-[0.8125rem] font-medium">Map pin</legend>
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium">
        Google Maps or Apple Maps link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="mapLink"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="winput min-w-0 flex-1"
          placeholder="https://maps.app.goo.gl/…"
          value={link}
          onChange={(e) => change(e.target.value)}
          aria-invalid={shown ? true : undefined}
          aria-describedby={`${id}-msg ${id}-help`}
        />
        <button type="button" onClick={locate} className="wbtn wbtn-secondary shrink-0" disabled={locating === "busy"}>
          {locating === "busy" ? "Finding you…" : "Use my current location"}
        </button>
      </div>

      <p id={`${id}-msg`} aria-live="polite" className={`mt-1.5 text-[0.75rem] ${shown ? "text-brick" : pin ? "text-sage-deep" : "text-stone-deep"}`}>
        {shown ??
          (status.kind === "checking"
            ? "Checking the link…"
            : pin
              ? `Pin found at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Check it's on the property.`
              : "Optional. Without a pin, the locality's centre is used and the reviewer sees it's approximate.")}
      </p>
      {locating === "error" && <p className="mt-1 text-[0.75rem] text-brick">Couldn&apos;t get your location. Check the browser&apos;s permission, or paste a link.</p>}

      {pin && (
        <div className="mt-3 overflow-hidden rounded-[3px] border border-line-light">
          <iframe
            title="The pin on a map"
            className="block h-48 w-full"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${pin.longitude - d},${pin.latitude - d},${pin.longitude + d},${pin.latitude + d}&layer=mapnik&marker=${pin.latitude},${pin.longitude}`}
          />
          <a href={googleMapsLink(pin)} target="_blank" rel="noreferrer" className="block border-t border-line-light px-3 py-2 text-[0.75rem] underline">
            Open in Google Maps ↗
          </a>
        </div>
      )}

      <details id={`${id}-help`} className="mt-3 text-[0.75rem] text-stone-deep">
        <summary className="cursor-pointer">How to copy the link</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-ink">Google Maps:</span> press and hold on the property to drop a pin, tap <em>Share</em>, then <em>Copy link</em>. On a computer, click
            the spot and copy the address bar.
          </li>
          <li>
            <span className="font-medium text-ink">Apple Maps:</span> touch and hold to drop a pin, tap <em>Share</em>, then <em>Copy</em>.
          </li>
          <li>A shared shop or building works too, as long as it&apos;s the property itself.</li>
        </ul>
      </details>
    </fieldset>
  );
}
