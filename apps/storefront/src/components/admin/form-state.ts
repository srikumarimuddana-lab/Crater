/** Shared by Server Actions (src/app/admin/_actions) and the client form components. */
export type FieldError = { field: string; message: string };
export type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  errors: FieldError[];
  /** Submitted values, echoed back so a failed save keeps the draft. */
  values?: Record<string, string>;
  conflict?: boolean;
};
export const IDLE: FormState = { status: 'idle', errors: [] };
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;
