import { Share } from "react-native";
import { Body, Button, Card, Small } from "@/components/ui";

/**
 * A one-time link for a landlord or tenant, shown once: share it (WhatsApp, SMS, or Copy from the
 * share sheet). It's emailed to them too, and works only for their email, once, for 72 hours.
 */
export function ShareLinkCard({ url, email, message, done }: { url: string; email?: string; message: string; done: string }) {
  return (
    <Card>
      <Body>
        {done} We emailed it{email ? ` to ${email}` : ""}. Send it to them too: it works only for that email, once, for 72 hours, and this is the only time it&apos;s shown.
      </Body>
      <Small selectable>{url}</Small>
      <Button label="Share the link" icon="share-outline" variant="accent" onPress={() => Share.share({ message: `${message} ${url}` })} />
    </Card>
  );
}
