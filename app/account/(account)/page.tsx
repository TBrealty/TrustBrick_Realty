import { redirect } from "next/navigation";
import { links } from "@/lib/site";

/** The account area opens on the profile. */
export default function AccountPage() {
  redirect(links.profile);
}
