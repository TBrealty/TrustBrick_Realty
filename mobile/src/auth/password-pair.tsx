import { View } from "react-native";
import { Field, Small } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/auth/form";

/**
 * A new password typed twice. As the second is typed it says whether they match: nothing while it's
 * still the start of the first, a tick when they're the same, a warning as soon as they differ.
 * The server checks again.
 */
export function PasswordPair({
  password,
  confirm,
  onPassword,
  onConfirm,
  errors,
  label = "Password",
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  errors: Record<string, string>;
  label?: string;
}) {
  const typing = confirm.length > 0 && confirm.length < password.length && password.startsWith(confirm);
  const live = !confirm || typing ? null : confirm === password ? "match" : "differ";
  return (
    <>
      <Field label={label} value={password} onChangeText={onPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint={`At least ${PASSWORD_MIN} characters.`} error={errors.password} />
      <View style={{ gap: 6 }}>
        <Field
          label={`Re-enter ${label.toLowerCase()}`}
          value={confirm}
          onChangeText={onConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={live === "differ" ? "The passwords don't match." : live === "match" ? undefined : errors.confirmPassword}
        />
        {live === "match" && <Small tone="sage">✓ The passwords match.</Small>}
      </View>
    </>
  );
}

/** Whether a password pair is ready to send: both typed and the same. */
export const pairReady = (password: string, confirm: string) => password.length > 0 && password === confirm;
