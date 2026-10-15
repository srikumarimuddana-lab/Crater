import 'server-only';
import { enqueueNotification } from '@/lib/communications';
import { getAdminRepository } from '../repository-factory';
import { getAdminSession } from '../session';
import { accountRepositoryFor } from './account-repository';
import { createAccountService } from './accounts';

export async function getAccountService() {
  const { admin, commerce } = await getAdminRepository();
  return createAccountService({
    admin,
    repo: accountRepositoryFor(commerce),
    getSession: getAdminSession,
    origin: process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    async enqueueLink({ recipient, kind, url, eventKey }) {
      const job = await enqueueNotification({ eventKey, channel: 'email', recipient, templateKey: kind === 'INVITE' ? 'staff_invitation' : 'staff_reset', variables: { link: url }, mode: process.env.COMMUNICATIONS_MODE === 'live' ? 'live' : 'test' });
      if (job.status === 'suppressed') throw new Error('Staff notification delivery is suppressed.');
    },
  });
}
