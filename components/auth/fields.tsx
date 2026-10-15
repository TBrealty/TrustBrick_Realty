"use client";

import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ACCOUNT_INTENTS, INTENT_LABELS } from "@/lib/intents";

const inputClass =
  "block h-12 w-full rounded-[2px] border bg-paper px-4 text-[1rem] text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-stone focus:outline-none focus-visible:outline-none focus:border-ink focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_28%,transparent)]";

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: React.ReactNode }) {
  if (error) {
    return (
      <p id={id} className="mt-2 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-brick">
        <svg viewBox="0 0 16 16" aria-hidden className="mt-px size-3.5 shrink-0">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 4.5v4.2M8 10.8v.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-2 text-[0.8125rem] leading-snug text-stone-deep">
        {hint}
      </p>
    );
  }
  return null;
}

type TextFieldProps = {
  label: string;
  name: string;
  type?: "text" | "email" | "tel" | "url";
  autoComplete: string;
  defaultValue?: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric" | "url";
  placeholder?: string;
  maxLength?: number;
};

export function TextField({ label, name, type = "text", autoComplete, defaultValue, error, hint, required = true, autoFocus, inputMode, placeholder, maxLength }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.8125rem] font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        maxLength={maxLength}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`${inputClass} ${error ? "border-brick" : "border-line-light"}`}
      />
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

/** "(optional)" after a label, for fields that aren't required. */
const Optional = () => <span className="font-normal text-stone-deep"> (optional)</span>;

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  error,
  hint,
  placeholder = "Choose",
  required = true,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  error?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.8125rem] font-medium text-ink">
        {label}
        {!required && <Optional />}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`${inputClass} appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10 ${error ? "border-brick" : "border-line-light"}`}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%236b655a' stroke-width='1.6'/%3E%3C/svg%3E\")" }}
      >
        <option value="" disabled={required}>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({ label, name, defaultValue, error, hint, rows = 3, maxLength, required = true }: { label: string; name: string; defaultValue?: string; error?: string; hint?: React.ReactNode; rows?: number; maxLength?: number; required?: boolean }) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.8125rem] font-medium text-ink">
        {label}
        {!required && <Optional />}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`${inputClass} h-auto py-3 leading-relaxed ${error ? "border-brick" : "border-line-light"}`}
      />
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

/** Large radio cards for a choice that changes the rest of the form. Works with the keyboard and without JavaScript. */
export function ChoiceCards({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: { value: string; title: string; description: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-message` : undefined}>
      <legend className="mb-3 block text-[0.8125rem] font-medium text-ink">{legend}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative flex cursor-pointer flex-col gap-1 rounded-[2px] border border-line-light bg-paper p-4 transition-colors duration-200 hover:border-ink/40 has-checked:border-ink has-checked:shadow-[inset_0_0_0_1px_var(--ink)] has-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_35%,transparent)]"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            <span className="flex items-center gap-2.5 text-[0.9375rem] font-medium text-ink">
              <span aria-hidden className={`grid size-4 place-items-center rounded-full border ${value === option.value ? "border-ink" : "border-stone"}`}>
                {value === option.value && <span className="size-2 rounded-full bg-ink" />}
              </span>
              {option.title}
            </span>
            <span className="pl-[1.625rem] text-[0.8125rem] leading-snug text-stone-deep">{option.description}</span>
          </label>
        ))}
      </div>
      {error && <FieldMessage id={`${id}-message`} error={error} />}
    </fieldset>
  );
}

type PasswordFieldProps = {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint?: React.ReactNode;
  minLength?: number;
  maxLength?: number;
  aside?: React.ReactNode;
  autoFocus?: boolean;
};

export function PasswordField({ label, name, autoComplete, error, hint, minLength, maxLength, aside, autoFocus }: PasswordFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const capsId = `${id}-caps`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const trackCaps = (event: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.("CapsLock") ?? false);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="block text-[0.8125rem] font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={maxLength}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="none"
          onKeyUp={trackCaps}
          onKeyDown={trackCaps}
          onBlur={() => setCapsLock(false)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error || hint ? messageId : "", capsLock ? capsId : ""].filter(Boolean).join(" ") || undefined}
          className={`${inputClass} pr-20 ${error ? "border-brick" : "border-line-light"}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-1 right-1 rounded-[2px] px-3 text-[0.8125rem] font-medium text-stone-deep transition-colors hover:text-ink"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {capsLock && (
        <p id={capsId} role="status" className="mt-2 text-[0.8125rem] text-stone-deep">
          Caps Lock is on.
        </p>
      )}
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

/** Native radios styled as chips: fully keyboard-operable and works before JavaScript loads. */
export function IntentField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const id = useId();
  const options: { value: string; label: string }[] = [
    ...ACCOUNT_INTENTS.map((value) => ({ value, label: INTENT_LABELS[value] })),
    { value: "", label: "Not sure yet" },
  ];
  const selected = defaultValue ?? "";

  return (
    <fieldset aria-describedby={error ? `${id}-message` : `${id}-hint`}>
      <legend className="mb-3 block text-[0.8125rem] font-medium text-ink">
        I&rsquo;m looking to <span className="font-normal text-stone-deep">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value || "none"}
            className="relative cursor-pointer rounded-[2px] border border-line-light bg-paper px-3.5 py-2 text-[0.875rem] text-graphite transition-colors duration-200 hover:border-ink/40 has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brick-bright)_35%,transparent)]"
          >
            <input type="radio" name="intent" value={option.value} defaultChecked={selected === option.value} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
      {error ? (
        <FieldMessage id={`${id}-message`} error={error} />
      ) : (
        <p id={`${id}-hint`} className="mt-2 text-[0.8125rem] text-stone-deep">
          Helps us show you what matters first. You can change it any time.
        </p>
      )}
    </fieldset>
  );
}

export function SubmitButton({ children, pendingLabel }: { children: React.ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className="btn btn-dark w-full disabled:cursor-wait disabled:opacity-80">
      {pending ? (
        <span className="flex items-center gap-2.5">
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 animate-spin">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {pendingLabel}
        </span>
      ) : (
        <span>{children}</span>
      )}
    </button>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-brick/40 bg-brick/[0.06] text-ink",
    success: "border-sage/40 bg-sage/[0.08] text-ink",
    info: "border-line-light bg-paper text-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`border-l-2 px-4 py-3 text-[0.9375rem] leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}
