const NOTE: Record<string, { suffix: string; title: string }> = {
  paused: { suffix: " · paused", title: "Subscription paused" },
  trialing: { suffix: " · trial", title: "On a free trial" },
  pending_payment: { suffix: " · unpaid", title: "Waiting for payment" },
  active: { suffix: "", title: "Subscribed" },
};

/** A person's own plan, as a small badge beside their name in the Users and Agents lists. */
export function PlanBadge({ plan }: { plan: { name: string; status: string } }) {
  const note = NOTE[plan.status] ?? NOTE.active;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium ${plan.status === "paused" ? "bg-amber/12 text-amber" : "bg-sage/15 text-sage-deep"}`} title={note.title}>
      {plan.name}
      {note.suffix}
    </span>
  );
}
