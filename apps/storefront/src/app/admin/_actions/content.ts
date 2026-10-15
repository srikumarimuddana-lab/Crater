'use server';
import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/admin/form-state';
import { contentSchemas } from '@/lib/content/cms/schema';
import { getCmsRepository, publishContent, saveDraft } from '@/lib/content/cms';
import { getMediaRepository, uploadImage, updateMediaDetails } from '@/lib/media';
import { requireAdmin } from '@/lib/admin';
const error = (e: unknown): FormState => ({ status: 'error', errors: [], message: e instanceof Error ? e.message : 'The change could not be saved.' });
export async function saveContentAction(_prev: FormState, fd: FormData): Promise<FormState> {
    try {
        const key = String(fd.get('key'));
        const schema = contentSchemas[key];
        if (!schema)
            throw new Error('Unknown page.');
        const data = Object.fromEntries(schema.fields.map(f => {
            if (f.type==='position') {
                const x=fd.get(`${f.key}X`),y=fd.get(`${f.key}Y`);
                if (x!==null || y!==null) return [f.key,`${String(x??'')} ${String(y??'')}`];
            }
            return [f.key,String(fd.get(f.key)??f.value)];
        }));
        await saveDraft(key, Number(fd.get('version')), data);
        revalidatePath(`/admin/content/${key}`);
        return { status: 'success', errors: [], message: 'Draft saved. Preview it, then publish when ready.' };
    }
    catch (e) {
        return { ...error(e), values: Object.fromEntries([...fd.entries()].filter((e): e is [
                string,
                string
            ] => typeof e[1] === 'string')) };
    }
}
export async function publishContentAction(_prev: FormState, fd: FormData): Promise<FormState> {
    try {
        const key = String(fd.get('key'));
        await publishContent(key, Number(fd.get('version')));
        revalidatePath('/', 'layout');
        return { status: 'success', errors: [], message: 'Published. The storefront now uses this version.' };
    }
    catch (e) {
        return error(e);
    }
}
export async function restoreContentAction(_prev: FormState, fd: FormData): Promise<FormState> {
    try {
        await requireAdmin('content:write');
        const key = String(fd.get('key'));
        const repo = await getCmsRepository();
        const revision = (await repo.history(key)).find(r => r.version === Number(fd.get('revision')));
        if (!revision)
            throw new Error('Revision not found.');
        await saveDraft(key, Number(fd.get('version')), revision.data);
        revalidatePath(`/admin/content/${key}`);
        return { status: 'success', errors: [], message: 'Revision restored to the draft. Preview before publishing.' };
    }
    catch (e) {
        return error(e);
    }
}
export async function uploadMediaAction(_prev: FormState, fd: FormData): Promise<FormState> {
    try {
        const file = fd.get('image');
        if (!(file instanceof File))
            throw new Error('Choose an image.');
        await uploadImage(file, String(fd.get('alt') ?? ''));
        revalidatePath('/admin/media');
        return { status: 'success', errors: [], message: 'Uploaded. This image is available in page and product editors.' };
    }
    catch (e) {
        return error(e);
    }
}
export async function archiveMediaAction(_prev: FormState, fd: FormData): Promise<FormState> {
    try {
        await requireAdmin('products:write');
        await (await getMediaRepository()).archive(String(fd.get('id')));
        revalidatePath('/admin/media');
        return { status: 'success', errors: [], message: 'Archived.' };
    }
    catch (e) {
        return error(e);
    }
}

export async function updateMediaDetailsAction(_prev:FormState,fd:FormData):Promise<FormState> {
    try {
        await updateMediaDetails(String(fd.get('id')??''),String(fd.get('name')??''),String(fd.get('alt')??''),{name:String(fd.get('expectedName')??''),alt:String(fd.get('expectedAlt')??'')});
        revalidatePath('/admin/media');
        return {status:'success',errors:[],message:'Image details saved. Page-specific descriptions can be edited in each page.'};
    } catch(e) { return error(e); }
}
