import { LogoMark } from "./Logo";

/**
 * The full brand lockup: shield mark, wordmark and tagline, stacked as in the
 * master logo. Built as vector so it stays crisp and inherits the section's
 * colour; drop the master file into /public/images/brand and swap it in here
 * if you would rather serve the original artwork.
 */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col items-start gap-5 ${className ?? ""}`}>
      <LogoMark className="size-14 sm:size-16" title="Trustbrick" />
      <div>
        <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] sm:text-[2rem]">
          Trust<span className="text-brick-bright">brick</span>
        </p>
        <p className="eyebrow mt-3 text-mist">Trust · Build · Deliver</p>
      </div>
    </div>
  );
}
