/** Workspace icons: one stroke weight, drawn on a 20px grid, always decorative (aria-hidden). */
const PATHS = {
  dashboard: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  building: "M4 17V4.5L11 3v14M11 7l5 1.5V17M2.5 17h15M6.5 7h2M6.5 10h2M6.5 13h2M13.5 11h.5M13.5 14h.5",
  inbox: "M3 11h4l1.5 2.5h3L13 11h4M3 11l2-7h10l2 7v5H3z",
  flag: "M4.5 17V3.5M4.5 4h10l-2 3.5 2 3.5h-10",
  users: "M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 16.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4M13.5 3.3a3 3 0 0 1 0 5.4M14.5 12.7c1.5.5 2.6 1.8 3 3.8",
  badge: "M10 2.5l2 1.6 2.6-.2.7 2.5 2.2 1.4-1 2.4 1 2.4-2.2 1.4-.7 2.5-2.6-.2L10 17.5l-2-1.6-2.6.2-.7-2.5-2.2-1.4 1-2.4-1-2.4 2.2-1.4.7-2.5 2.6.2zM7.2 10l2 2 3.6-3.8",
  briefcase: "M3 6.5h14v10H3zM7 6.5V4h6v2.5M3 10.5h14",
  shield: "M10 2.5l6 2.2v4.8c0 3.7-2.5 6.5-6 8-3.5-1.5-6-4.3-6-8V4.7z",
  plus: "M10 4v12M4 10h12",
  calendar: "M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3.5M13 3v3.5",
  chart: "M3 17h14M5.5 14V9.5M9.5 14V5M13.5 14v-6",
  scroll: "M5 3.5h10v13H5zM7.5 7h5M7.5 10h5M7.5 13h3",
  sliders: "M4 5h6M13 5h3M4 10h2M9 10h7M4 15h8M15 15h1M11.5 3.5v3M7.5 8.5v3M13.5 13.5v3",
  bell: "M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 2h-13zM8.3 17.5a2 2 0 0 0 3.4 0",
  search: "M8.5 14.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13 13l4.5 4.5",
  user: "M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17c.8-3 3.3-4.5 6.5-4.5s5.7 1.5 6.5 4.5",
  logout: "M8 3.5H4v13h4M13 6.5 16.5 10 13 13.5M16.5 10H8",
  menu: "M3 5.5h14M3 10h14M3 14.5h14",
  close: "M5 5l10 10M15 5 5 15",
  chevronLeft: "M12.5 4.5 7 10l5.5 5.5",
  chevronRight: "M7.5 4.5 13 10l-5.5 5.5",
  copy: "M7 7h9v9H7zM4 13V4h9",
  check: "M4 10.5l4 4 8-9",
  external: "M11 3.5h5.5V9M16.5 3.5 9 11M14 12v4.5H3.5V6H8",
  swap: "M4 7h11l-3-3M16 13H5l3 3",
  home: "M3 9.5 10 3l7 6.5M5 8v8.5h10V8",
  chat: "M3.5 4.5h13v9.5H9.5l-4 3v-3h-2z",
  rupee: "M6 4h8M6 7.5h8M6 4c5 0 5 7 0 7h-.5L12 17",
  scale: "M10 3v14M6.5 17h7M4 5.5h12M4 5.5 2 11a2 2 0 0 0 4 0zM16 5.5 14 11a2 2 0 0 0 4 0z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
