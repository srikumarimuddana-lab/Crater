import { describe,it,expect,vi,beforeEach } from 'vitest';
const {requireAdmin}=vi.hoisted(()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/admin/session',()=>({requireAdmin}));
import { requireCommunications } from '@/lib/communications/access';
const roles=['OWNER','ADMIN','SUPPORT','FULFILMENT','BOOKKEEPER'] as const;
describe('communications authorization',()=>{
  beforeEach(()=>{vi.resetAllMocks();});
  for(const role of roles)it(`enforces ${role} module access`,async()=>{
    requireAdmin.mockResolvedValue({staff:{role}});
    if(['OWNER','ADMIN','SUPPORT'].includes(role))await expect(requireCommunications()).resolves.toBeDefined();else await expect(requireCommunications()).rejects.toThrow();
    if(['OWNER','ADMIN'].includes(role))await expect(requireCommunications('manage')).resolves.toBeDefined();else await expect(requireCommunications('manage')).rejects.toThrow();
    if(role==='OWNER')await expect(requireCommunications('integrations')).resolves.toBeDefined();else await expect(requireCommunications('integrations')).rejects.toThrow();
  });
  it('fails closed when no session exists',async()=>{requireAdmin.mockRejectedValue(new Error('UNAUTHENTICATED'));await expect(requireCommunications()).rejects.toThrow('UNAUTHENTICATED');});
});
