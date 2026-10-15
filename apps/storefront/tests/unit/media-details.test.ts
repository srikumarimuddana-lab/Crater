import { expect,it } from 'vitest';
import { createMemoryMediaRepository } from '@/lib/media/repository';
it('edits media details with a conflict check and preserves published image bytes',async()=>{
  const repo=createMemoryMediaRepository();const asset=await repo.create({name:'Original',alt:'Before',mime:'image/webp',width:20,height:20,content:Buffer.from('immutable image')});
  await repo.publish([asset.id]);
  await repo.updateDetails(asset.id,{name:'Updated',alt:'After'},{name:'Original',alt:'Before'});
  expect(await repo.get(asset.id)).toMatchObject({name:'Updated',alt:'After',published:true,content:Buffer.from('immutable image')});
  await expect(repo.updateDetails(asset.id,{name:'Stale',alt:'Overwrite'},{name:'Original',alt:'Before'})).rejects.toThrow(/changed/);
});
it('does not edit an archived upload',async()=>{
  const repo=createMemoryMediaRepository();const asset=await repo.create({name:'Original',alt:'Before',mime:'image/webp',width:20,height:20,content:Buffer.from('image')});
  await repo.archive(asset.id);
  await expect(repo.updateDetails(asset.id,{name:'Updated',alt:'After'},{name:'Original',alt:'Before'})).rejects.toThrow();
});
