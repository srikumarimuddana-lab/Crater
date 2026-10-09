'use client';

import { createContext, useContext, useActionState, useEffect, useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { IDLE, type FormAction, type FormState } from './form-state';
import { Icon } from './icons';

type Ctx = { state: FormState; formId: string };
const FormCtx = createContext<Ctx>({ state: IDLE, formId: '' });
const fieldId = (formId: string, name: string) => `${formId}${name.replace(/[^A-Za-z0-9]+/g, '-')}`;

/**
 * Server Action form: posts before hydration, shows pending state, an error summary (role=alert, focused)
 * and inline field errors (aria-invalid + aria-describedby). `children` may use Field/Submit.
 */
export function ActionForm({ action, children, className, label, errorTitle = 'We could not save this' }: { action: FormAction; children: ReactNode; className?: string; label?: string; errorTitle?: string }) {
  const [state, formAction] = useActionState(action, IDLE);
  const formId = useId();
  return (
    <FormCtx.Provider value={{ state, formId }}>
      <form action={formAction} className={className} aria-label={label} noValidate>
        <Summary title={errorTitle} />
        {state.status === 'success' && state.message ? (
          <div className="a-notice is-success" role="status" style={{ marginBottom: 16 }}>
            <Icon shape="check-circle" size={16} />
            <div>{state.message}</div>
          </div>
        ) : null}
        {children}
      </form>
    </FormCtx.Provider>
  );
}

function Summary({ title }: { title: string }) {
  const { state, formId } = useContext(FormCtx);
  const ref = useRef<HTMLDivElement>(null);
  const hasError = state.status === 'error';
  useEffect(() => {
    if (hasError) ref.current?.focus();
  }, [hasError, state]);
  if (!hasError) return null;
  const fieldErrors = state.errors.filter((e) => e.field);
  const general = state.errors.filter((e) => !e.field).map((e) => e.message);
  if (state.message) general.unshift(state.message);
  return (
    <div ref={ref} className="a-errsummary" role="alert" tabIndex={-1}>
      <strong>{state.conflict ? 'Someone else changed this' : title}</strong>
      {general.length ? <p>{general.join(' ')}</p> : null}
      {state.conflict ? (
        <p>
          <a href="">Reload the latest version</a>. Your draft stays on this page until you reload.
        </p>
      ) : null}
      {fieldErrors.length ? (
        <ul>
          {fieldErrors.map((e) => (
            <li key={`${e.field}:${e.message}`}>
              <a
                href={`#${fieldId(formId, e.field)}`}
                onClick={(ev) => {
                  const el = document.getElementById(fieldId(formId, e.field));
                  if (el) {
                    ev.preventDefault();
                    el.focus();
                  }
                }}
              >
                {e.message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: string;
  as?: 'input' | 'textarea' | 'select';
  defaultValue?: string;
  hint?: ReactNode;
  required?: boolean;
  options?: { value: string; label: string }[];
  rows?: number;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email';
  autoComplete?: string;
  maxLength?: number;
  readOnly?: boolean;
  autoFocus?: boolean;
  pattern?: string;
  placeholder?: string;
};

export function Field({ name, label, type = 'text', as = 'input', defaultValue = '', hint, required, options, rows = 4, inputMode, autoComplete, maxLength, readOnly, autoFocus, pattern, placeholder }: FieldProps) {
  const { state, formId } = useContext(FormCtx);
  const id = fieldId(formId, name);
  const error = state.errors.find((e) => e.field === name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const value = state.values?.[name] ?? defaultValue;
  const common = { id, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined, readOnly, autoFocus };
  return (
    <div className="a-field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="a-req">Required</span> : null}
      </label>
      {as === 'textarea' ? (
        <textarea key={value} {...common} rows={rows} maxLength={maxLength} defaultValue={value} />
      ) : as === 'select' ? (
        <select key={value} {...common} defaultValue={value}>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input key={value} {...common} type={type} inputMode={inputMode} autoComplete={autoComplete} maxLength={maxLength} pattern={pattern} placeholder={placeholder} defaultValue={value} />
      )}
      {hint ? (
        <p id={hintId} className="a-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="a-error">
          <Icon shape="octagon-x" size={14} />
          <span>{error.message}</span>
        </p>
      ) : null}
    </div>
  );
}

export function Submit({ children, pendingText = 'Saving…', primary = true, className }: { children: ReactNode; pendingText?: string; primary?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`a-btn${primary ? ' is-primary' : ''}${className ? ` ${className}` : ''}`} aria-disabled={pending || undefined} onClick={(e) => pending && e.preventDefault()}>
      {pending ? pendingText : children}
    </button>
  );
}
