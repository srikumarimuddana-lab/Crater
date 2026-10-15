'use client';
import { useActionState, type ReactNode } from 'react';
import type { FormAction } from '@/components/admin/form-state';
import { IDLE } from '@/components/admin/form-state';
export function FinanceForm({ action, children, label }: {
    action: FormAction;
    children: ReactNode;
    label: string;
}) {
    const [state, formAction, pending] = useActionState(action, IDLE);
    return <form action={formAction} className="a-form"><fieldset disabled={pending} style={{ border: 0, padding: 0, display: 'grid', gap: '1rem' }}>{children}<button className="a-btn" type="submit">{pending ? 'Working…' : label}</button></fieldset>{state.message ? <p role={state.status === 'error' ? 'alert' : 'status'}>{state.message}</p> : null}</form>;
}
