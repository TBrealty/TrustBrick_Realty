import type { Metadata } from "next";

/**
 * Trips and Messages belong to Home Stay: each page renders inside its shell (ServicePage),
 * not the account layout, while keeping its /account address, which emails link to.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HomeStayAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
