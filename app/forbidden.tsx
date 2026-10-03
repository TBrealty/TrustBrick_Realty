import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="grid min-h-[60svh] place-items-center bg-paper px-6 py-20 text-center text-ink">
      <div className="max-w-md">
        <p className="font-mono text-[0.75rem] tracking-widest text-brick uppercase">403 · Not allowed</p>
        <h1 className="mt-4 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">You don&apos;t have access to this page</h1>
        <p className="mt-3 text-[0.9375rem] text-stone-deep">
          Your role doesn&apos;t include this. If you think it should, ask an administrator to change your permissions.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/dashboard" className="wbtn wbtn-primary">
            Go to your dashboard
          </Link>
          <Link href="/" className="wbtn wbtn-secondary">
            Trustbrick website
          </Link>
        </div>
      </div>
    </main>
  );
}
