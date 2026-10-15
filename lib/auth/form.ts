/** Shared between server actions and the client form components. */
export type Field = "name" | "email" | "password" | "confirmPassword" | "intent";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<Field, string>>;
  /** Echoed back so a failed submit does not wipe what was typed. Never includes passwords. */
  values?: Partial<Record<"name" | "email" | "intent", string>>;
};

export const initialFormState: FormState = { status: "idle" };

/** The agent application forms (signing up as an agent, or applying while signed in): many fields, keyed by name. */
export type AgentFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** What was typed, so a failed submit keeps it. Never includes the password. */
  values?: Record<string, string>;
};

export const initialAgentFormState: AgentFormState = { status: "idle" };

/** Where the signup flow remembers the address shown on the "check your email" page. */
export const PENDING_EMAIL_COOKIE = "tb_pending_email";

/** Password policy, shared by the server config and the form hints so they cannot drift. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
