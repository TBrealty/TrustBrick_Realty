/**
 * The ecosystem drawn as a wall in running bond: each participant is a brick,
 * and a slow light travels through the mortar joints that bind them.
 * Placement is explicit so the bond survives the change from 4 to 6 columns.
 */
const participants = [
  { name: "Homebuyers", note: "Clarity before commitment.", place: "col-[1/3] row-1 lg:col-[1/3] lg:row-1" },
  { name: "Renters", note: "Homes without the guesswork.", place: "col-[3/5] row-1 lg:col-[3/5] lg:row-1" },
  { name: "Sellers", note: "Serious buyers, simpler journeys.", place: "col-[2/4] row-2 lg:col-[5/7] lg:row-1" },
  { name: "Agents", note: "Tools that respect your time.", place: "col-[1/3] row-3 lg:col-[2/4] lg:row-2" },
  { name: "Brokers", note: "A sharper, better-run business.", place: "col-[3/5] row-3 lg:col-[4/6] lg:row-2" },
  { name: "Developers", note: "From launch to handover.", place: "col-[2/4] row-4 lg:col-[1/3] lg:row-3" },
  { name: "Property Managers", note: "Portfolios, properly organized.", place: "col-[1/3] row-5 lg:col-[3/5] lg:row-3" },
  { name: "Investors", note: "Decisions backed by evidence.", place: "col-[3/5] row-5 lg:col-[5/7] lg:row-3" },
];

const halves = [
  "col-[1/2] row-2 lg:col-[1/2] lg:row-2",
  "col-[4/5] row-2 lg:col-[6/7] lg:row-2",
  "col-[1/2] row-4 lg:hidden",
  "col-[4/5] row-4 lg:hidden",
];

export function BrickBond() {
  return (
    <div className="mortar relative isolate grid grid-cols-4 gap-1 overflow-hidden p-1 sm:gap-1.5 sm:p-1.5 lg:grid-cols-6">
      {/* Light travelling through the mortar joints: a composited transform, so it never repaints. */}
      <span aria-hidden className="mortar-light" />
      <ul className="contents">
        {participants.map((p, i) => (
          <li
            key={p.name}
            data-reveal="fade"
            style={{ "--d": `${i * 90}ms` } as React.CSSProperties}
            className={`${p.place} group relative flex min-h-34 flex-col justify-end bg-paper p-4 transition-colors duration-500 ease-(--ease-smooth) sm:min-h-40 sm:p-6 lg:min-h-44 lg:px-7 lg:py-6 [@media(hover:hover)]:hover:bg-contrast-2 [@media(hover:hover)]:hover:text-on-contrast`}
          >
            <span className="eyebrow absolute top-4 right-4 tabular-nums text-stone-deep transition-colors duration-500 group-hover:text-mist sm:top-5 sm:right-6">
              0{i + 1}
            </span>
            <span className="display block pr-6 text-[clamp(1.6rem,4.4vw,2.9rem)] leading-[0.95]">{p.name}</span>
            <span className="mt-2 block text-[0.8125rem] leading-snug text-stone-deep transition-colors duration-500 group-hover:text-on-contrast/70 sm:text-[0.9375rem]">
              {p.note}
            </span>
          </li>
        ))}
      </ul>
      {halves.map((place) => (
        <span
          key={place}
          aria-hidden
          className={`${place} relative bg-paper bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(13_17_25/0.045)_7px_8px)]`}
        />
      ))}
    </div>
  );
}
