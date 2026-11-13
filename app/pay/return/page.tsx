import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServicePage } from "@/components/navigation/ServicePage";
import { PaymentResult } from "@/components/stays/PaymentResult";
import { requireSession } from "@/lib/auth/session";
import { SERVICE_SHELLS } from "@/lib/listings/services";
import { isReferenceId, normalizeReferenceId } from "@/lib/reference";
import { checkoutStatus } from "@/lib/services/stays/payments";

export const metadata: Metadata = { title: "Your payment — Trustbrick", robots: { index: false } };

type Props = { searchParams: Promise<{ payment?: string }> };

/** Where the guest lands after the provider's checkout: booked, request sent, failed, or still confirming. */
export default async function PaymentReturnPage({ searchParams }: Props) {
  const ref = normalizeReferenceId(String((await searchParams).payment ?? ""));
  if (!isReferenceId(ref, "PAY")) notFound();
  const { user } = await requireSession(`/pay/return?payment=${ref}`);
  const status = await checkoutStatus(user.id, ref).catch(() => null);
  if (!status) notFound();
  return (
    <ServicePage shell={SERVICE_SHELLS.stay!} current="trips" mainClassName="shell pt-10 pb-20 sm:pt-16">
      <PaymentResult initial={status} />
    </ServicePage>
  );
}
