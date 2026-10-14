-- Switch built-in staff access to password-only authentication.
-- The migration runner executes this exactly once in a transaction. Invalidate both
-- complete and pending sessions so no session from the retired protocol survives.
-- Preserve staff IDs, roles, password hashes and audit history.
delete from admin.staff_sessions;
delete from admin.pending_sign_ins;
update admin.staff_users
set totp_secret_enc = null, mfa_enrolled_at = null, last_totp_step = null
where totp_secret_enc is not null or mfa_enrolled_at is not null or last_totp_step is not null;

-- Nullable legacy columns/tables remain for repository compatibility; new auth code
-- never creates pending sign-ins, decrypts a TOTP secret or marks a factor verified.

create table if not exists admin.account_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  staff_id integer not null references admin.staff_users(id) on delete cascade,
  kind text not null check (kind in ('INVITE', 'RESET')),
  expires_at timestamptz not null
);
create index if not exists account_tokens_staff_idx on admin.account_tokens(staff_id);
create index if not exists account_tokens_expiry_idx on admin.account_tokens(expires_at);
alter table admin.account_tokens enable row level security;
revoke all on admin.account_tokens from public;
