"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { OWNERSHIP_PROOF_KINDS, type OwnershipProofKind } from "@/lib/vocab";

const LABELS: Record<OwnershipProofKind, string> = {
  sale_deed: "Sale deed",
  property_tax_receipt: "Property tax receipt",
  allotment_letter: "Allotment or possession letter",
  electricity_bill: "Electricity bill in your name",
  other: "Other proof of ownership",
};

/** Upload proof of ownership: what it is, and the file (PDF, JPEG or PNG, up to 10 MB). */
export function ProofUpload({ propertyRef, replacing = false }: { propertyRef: string; replacing?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [kind, setKind] = useState<OwnershipProofKind>("property_tax_receipt");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("The file is larger than 10 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rent/proofs/${encodeURIComponent(propertyRef)}?kind=${kind}`, { method: "POST", body: file, headers: { "x-file-name": encodeURIComponent(file.name) } });
      const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "The upload failed. Please try again.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) return <p className="rounded-[3px] border-l-2 border-sage bg-sage/10 px-3 py-2 text-[0.8125rem] text-sage">Uploaded. Trustbrick will check it and let you know.</p>;
  return (
    <form onSubmit={upload} className="space-y-3" aria-busy={busy}>
      {error && (
        <p role="alert" className="rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-brick">
          {error}
        </p>
      )}
      <div>
        <label htmlFor={`${id}-kind`} className="mb-1 block text-[0.8125rem] font-medium">
          What is it?
        </label>
        <select id={`${id}-kind`} className="winput" value={kind} onChange={(e) => setKind(e.target.value as OwnershipProofKind)}>
          {OWNERSHIP_PROOF_KINDS.map((k) => (
            <option key={k} value={k}>
              {LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-file`} className="mb-1 block text-[0.8125rem] font-medium">
          The document
        </label>
        <input id={`${id}-file`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-[0.8125rem]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <p className="mt-1 text-[0.75rem] text-stone-deep">A PDF or a clear photo, up to 10 MB. It must show your name and this property. Only you and Trustbrick&apos;s checkers can see it.</p>
      </div>
      <button type="submit" className="wbtn wbtn-primary" disabled={busy}>
        {busy ? "Uploading…" : replacing ? "Upload a new proof" : "Upload proof"}
      </button>
    </form>
  );
}
