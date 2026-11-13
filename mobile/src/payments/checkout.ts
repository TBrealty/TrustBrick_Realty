import * as WebBrowser from "expo-web-browser";
import type { CheckoutStart } from "@/api/types";

/**
 * Opens the payment provider's checkout for an order the server just made, and resolves once the
 * guest is back in the app. It never decides whether the payment worked: the result screen asks
 * the server, which asks the provider.
 *
 * - "redirect": a web checkout (the test provider in development) in an in-app browser session.
 * - "cashfree": Cashfree's native SDK, added to the app together with the Cashfree connection.
 */
export async function openCheckout(start: CheckoutStart): Promise<void> {
  if (start.checkout.kind === "redirect") {
    await WebBrowser.openAuthSessionAsync(start.checkout.url, "trustbrick://pay");
    return;
  }
  throw new Error("Paying in the app needs the latest version. Please update Trustbrick, or book on the website.");
}
