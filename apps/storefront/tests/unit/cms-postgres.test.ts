import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { createPostgresCmsRepository } from '@/lib/content/cms/repository';
import { createPostgresMediaRepository } from '@/lib/media/repository';
import { defaultsFor } from '@/lib/content/cms/schema';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('CMS PostgreSQL publication',()=>{
 let pool:Pool;
 beforeAll(async()=>{pool=new Pool({connectionString:url});await pool.query('create schema if not exists admin');await pool.query(await readFile('db/migrations/0007_content_media.sql','utf8'));await pool.query('truncate admin.content_revisions,admin.content_documents,admin.media_assets cascade');});
 afterAll(async()=>{await pool?.end();});
 it('publishes the draft and media atomically and preserves private assets on conflict',async()=>{
  const cms=createPostgresCmsRepository(pool),media=createPostgresMediaRepository(pool);
  const asset=await media.create({name:'test',alt:'Test photo',mime:'image/webp',width:1,height:1,content:Buffer.from('pixels')});
  await cms.save('home',0,{...defaultsFor('home'),heroImage:`/api/media/${asset.id}`},'owner');
  expect((await cms.read('home')).published).toBeNull();
  await expect(cms.publish('home',0,'owner')).rejects.toThrow(/changed/);
  expect((await media.get(asset.id))?.published).toBe(false);
  await cms.publish('home',1,'owner');
  expect((await media.get(asset.id))?.published).toBe(true);
  await expect(media.archive(asset.id)).rejects.toThrow(/Published/);
  expect((await cms.read('home')).published?.heroImage).toBe(`/api/media/${asset.id}`);
 });
 it('rejects unavailable media without publishing any content',async()=>{
  const cms=createPostgresCmsRepository(pool);
  await cms.save('about',0,{...defaultsFor('about'),image:'/api/media/00000000-0000-0000-0000-000000000001'},'owner');
  await expect(cms.publish('about',1,'owner')).rejects.toThrow(/unavailable/);
  expect((await cms.read('about')).published).toBeNull();
  expect((await cms.read('about')).version).toBe(1);
 });
 it('edits media metadata with compare-and-set while retaining immutable published bytes',async()=>{
  const media=createPostgresMediaRepository(pool);
  const asset=await media.create({name:'Before',alt:'Old description',mime:'image/webp',width:1,height:1,content:Buffer.from('stable bytes')});
  await media.publish([asset.id]);
  await media.updateDetails(asset.id,{name:'After',alt:'New description'},{name:'Before',alt:'Old description'});
  const updated=await media.get(asset.id);
  expect(updated).toMatchObject({name:'After',alt:'New description',published:true});
  expect(Buffer.from(updated!.content)).toEqual(Buffer.from('stable bytes'));
  await expect(media.updateDetails(asset.id,{name:'Stale',alt:''},{name:'Before',alt:'Old description'})).rejects.toThrow(/changed/);
 });

 it('does not treat a media path written in body copy as an image reference',async()=>{
  const cms=createPostgresCmsRepository(pool),media=createPostgresMediaRepository(pool);
  const asset=await media.create({name:'Unselected private image',alt:'Private',mime:'image/webp',width:1,height:1,content:Buffer.from('private bytes')});
  await cms.save('contact',0,{...defaultsFor('contact'),image:'',body:`/api/media/${asset.id}`},'editor');
  await cms.publish('contact',1,'editor');
  expect((await media.get(asset.id))?.published).toBe(false);
 });

});
