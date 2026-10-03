"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";

/**
 * Forms that call server actions. The server action is the authority: it validates,
 * authorizes and returns field errors, which the fields below display inline. Nothing
 * here grants or hides anything that matters.
 */
type Action = (
  prev: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

const FieldErrors = createContext<Record<string, string>>({});
const Pending = createContext(false);

/**
 * Runs a server action from a form without React 19's automatic form reset. That reset would
 * wipe what someone typed whenever the server returns a validation error. The `action` prop is
 * kept for progressive enhancement: without JavaScript the form still posts to the action.
 */
export function useFormAction<S>(
  action: (prev: S | null, form: FormData) => Promise<S>,
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
  return { state, pending, formAction: dispatch, onSubmit };
}

/** For custom submit buttons outside <Submit>: whether the surrounding ActionForm is working. */
export const useActionPending = () => useContext(Pending);

export function ActionForm({
  action,
  children,
  className = "",
  successMessage,
  onSuccess,
  resetOnSuccess = false,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  onSuccess?: (result: ActionResult) => void;
  resetOnSuccess?: boolean;
}) {
  const { state, pending, formAction, onSubmit } = useFormAction(action);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    } else if (state.fieldErrors) {
      const first = Object.keys(state.fieldErrors)[0];
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`)
        ?.focus();
    }
  }, [state, onSuccess, resetOnSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      className={className}
      noValidate
      aria-busy={pending}
    >
      <Pending.Provider value={pending}>
        <FieldErrors.Provider
          value={state && !state.ok ? (state.fieldErrors ?? {}) : {}}
        >
          {state && !state.ok && (
            <p
              role="alert"
              className="mb-4 rounded-[3px] border-l-2 border-brick bg-brick/6 px-3 py-2 text-[0.8125rem] text-brick"
            >
              {state.message}
            </p>
          )}
          {state?.ok && (successMessage || state.message) && (
            <p
              role="status"
              className="mb-4 rounded-[3px] border-l-2 border-sage bg-sage/10 px-3 py-2 text-[0.8125rem] text-sage"
            >
              {state.message ?? successMessage}
            </p>
          )}
          {children}
        </FieldErrors.Provider>
      </Pending.Provider>
    </form>
  );
}

export function useFieldError(name: string) {
  return useContext(FieldErrors)[name];
}

export function Submit({
  children,
  variant = "primary",
  className = "",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  name?: string;
  value?: string;
}) {
  const formPending = useFormStatus().pending;
  const pending = useContext(Pending) || formPending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`wbtn wbtn-${variant} ${className}`}
      aria-busy={pending}
    >
      {pending && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  name: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }) => React.ReactNode;
};

export function Field({
  label,
  name,
  hint,
  required,
  className = "",
  children,
}: FieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const describedBy = error || hint ? `${id}-msg` : undefined;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[0.8125rem] font-medium text-ink"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-brick" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        required,
      })}
      {(error || hint) && (
        <p
          id={`${id}-msg`}
          className={`mt-1.5 text-[0.75rem] ${error ? "text-brick" : "text-stone-deep"}`}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & {
  label: string;
  name: string;
  hint?: React.ReactNode;
  fieldClassName?: string;
};

export function TextInput({
  label,
  name,
  hint,
  required,
  fieldClassName,
  ...rest
}: InputProps) {
  return (
    <Field
      label={label}
      name={name}
      hint={hint}
      required={required}
      className={fieldClassName}
    >
      {(p) => (
        <input {...p} {...rest} className={`winput ${rest.className ?? ""}`} />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  name,
  hint,
  required,
  fieldClassName,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> & {
  label: string;
  name: string;
  hint?: React.ReactNode;
  fieldClassName?: string;
}) {
  return (
    <Field
      label={label}
      name={name}
      hint={hint}
      required={required}
      className={fieldClassName}
    >
      {(p) => <textarea {...p} {...rest} className="winput" />}
    </Field>
  );
}

export function Select({
  label,
  name,
  hint,
  required,
  options,
  placeholder,
  fieldClassName,
  ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
  label: string;
  name: string;
  hint?: React.ReactNode;
  options: { value: string; label: string }[];
  placeholder?: string;
  fieldClassName?: string;
}) {
  return (
    <Field
      label={label}
      name={name}
      hint={hint}
      required={required}
      className={fieldClassName}
    >
      {(p) => (
        <select {...p} {...rest} className="winput">
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
  hint,
  value = "on",
}: {
  label: React.ReactNode;
  name: string;
  defaultChecked?: boolean;
  hint?: React.ReactNode;
  value?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 accent-ink"
        aria-invalid={error ? true : undefined}
      />
      <label htmlFor={id} className="text-[0.8125rem] leading-snug text-ink">
        {label}
        {(hint || error) && (
          <span
            className={`mt-0.5 block text-[0.75rem] ${error ? "text-brick" : "text-stone-deep"}`}
          >
            {error ?? hint}
          </span>
        )}
      </label>
    </div>
  );
}

/**
 * A button that opens a dialog to confirm a consequential action. Sensitive actions can
 * require a reason, the actor's password, or typing a phrase. The server re-checks all of it.
 */
export function ConfirmAction({
  label,
  title,
  description,
  action,
  hidden,
  variant = "secondary",
  confirmLabel,
  reason,
  password = false,
  phrase,
  children,
  size = "sm",
}: {
  label: string;
  title: string;
  description?: React.ReactNode;
  action: Action;
  hidden?: Record<string, string>;
  variant?: "primary" | "secondary" | "danger";
  confirmLabel?: string;
  reason?: { required: boolean; label?: string; placeholder?: string };
  password?: boolean;
  phrase?: string;
  children?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [key, setKey] = useState(0);
  const titleId = useId();

  const close = () => {
    dialogRef.current?.close();
    setTyped("");
    setKey((k) => k + 1);
  };

  return (
    <>
      <button
        type="button"
        className={`wbtn wbtn-${variant} ${size === "sm" ? "wbtn-sm" : ""}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[4px] border border-line-light bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/50"
        onClose={() => setTyped("")}
      >
        <div className="p-5 sm:p-6">
          <h2 id={titleId} className="text-[1.0625rem] font-semibold">
            {title}
          </h2>
          {description && (
            <div className="mt-2 text-[0.8125rem] text-stone-deep">
              {description}
            </div>
          )}
          <ActionForm
            key={key}
            action={action}
            onSuccess={close}
            className="mt-5 space-y-4"
          >
            {Object.entries(hidden ?? {}).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {children}
            {reason && (
              <TextArea
                label={
                  reason.label ??
                  (reason.required ? "Reason" : "Note (optional)")
                }
                name="reason"
                required={reason.required}
                placeholder={reason.placeholder}
                rows={3}
                hint={
                  reason.required
                    ? "At least 10 characters. It is recorded in the audit log."
                    : undefined
                }
              />
            )}
            {phrase && (
              <Field label={`Type ${phrase} to confirm`} name="phrase" required>
                {(p) => (
                  <input
                    {...p}
                    className="winput font-mono"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                )}
              </Field>
            )}
            {password && (
              <TextInput
                label="Your password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                hint="Sensitive actions need your password again."
              />
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="wbtn wbtn-secondary"
                onClick={close}
              >
                Cancel
              </button>
              <PhraseGatedSubmit
                variant={variant === "secondary" ? "primary" : variant}
                enabled={!phrase || typed.trim() === phrase}
              >
                {confirmLabel ?? label}
              </PhraseGatedSubmit>
            </div>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}

function PhraseGatedSubmit({
  children,
  variant,
  enabled,
}: {
  children: React.ReactNode;
  variant: "primary" | "danger";
  enabled: boolean;
}) {
  const formPending = useFormStatus().pending;
  const pending = useContext(Pending) || formPending;
  return (
    <button
      type="submit"
      className={`wbtn wbtn-${variant}`}
      disabled={!enabled || pending}
      aria-busy={pending}
    >
      {pending && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

/** Submits its form when a filter changes, so filter bars need no Apply button with JS on. */
export function AutoSubmit({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="contents"
      onChange={(e) => {
        const target = e.target as HTMLElement;
        if (
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLInputElement &&
            (target.type === "checkbox" || target.type === "date"))
        ) {
          target.form?.requestSubmit();
        }
      }}
    >
      {children}
    </div>
  );
}
