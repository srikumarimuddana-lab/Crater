'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin/session';
import { requireSubmissionOrigin } from '@/lib/communications/public-forms';
import { getChat } from '@/lib/chat';
import type { ActionResult } from '@/lib/communications/form';
export async function saveChatDraft(
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    requireSubmissionOrigin(
      new Request(process.env.SITE_URL || 'http://localhost', {
        headers: await headers(),
      }),
    );
    const session = await requireAdmin('chat:manage'),
      questions = [];
    for (let i = 0; i < 30; i++) {
      const label = String(fd.get(`label${i}`) ?? '').trim();
      if (label && fd.get(`remove${i}`) !== 'on')
        questions.push({
          id: String(fd.get(`id${i}`) || `question-${i}`),
          label,
          answer: String(fd.get(`answer${i}`) || ''),
          href: String(fd.get(`href${i}`) || '') || null,
        });
    }
    await (
      await getChat()
    ).save(
      {
        enabled: fd.get('enabled') === 'on',
        title: String(fd.get('title') || ''),
        greeting: String(fd.get('greeting') || ''),
        fallback: String(fd.get('fallback') || ''),
        followUpLabel: String(fd.get('followUpLabel') || ''),
        allowedPaths: String(fd.get('allowedPaths') || '')
          .split(/\s+/)
          .filter(Boolean),
        retentionDays: Number(fd.get('retentionDays')),
        questions,
      },
      Number(fd.get('version')),
      session.staff.id,
    );
    revalidatePath('/admin/chat');
    return {
      message: 'Draft saved. Preview it below, then publish when ready.',
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save chat.' };
  }
}
export async function publishChat(
  _: ActionResult,
  fd: FormData,
): Promise<ActionResult> {
  try {
    requireSubmissionOrigin(
      new Request(process.env.SITE_URL || 'http://localhost', {
        headers: await headers(),
      }),
    );
    const session = await requireAdmin('chat:manage');
    await (
      await getChat()
    ).publish(Number(fd.get('version')), session.staff.id);
    revalidatePath('/admin/chat');
    revalidatePath('/', 'layout');
    return { message: 'Chat settings published.' };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Could not publish chat.',
    };
  }
}
