import { eventsService, staffService } from './events';
import { inventoryService } from './inventory';
import { ordersService } from './orders';
import { overviewService } from './overview';
import { productsService } from './products';
import { makeCtx, type ServiceDeps } from './shared';

export type { ServiceDeps };

/** All admin services over one repository pair. Each method enforces its own capability and audits mutations. */
export function createAdminServices(deps: ServiceDeps) {
  const ctx = makeCtx(deps);
  return {
    overview: overviewService(ctx),
    orders: ordersService(ctx),
    products: productsService(ctx),
    inventory: inventoryService(ctx),
    events: eventsService(ctx),
    staff: staffService(ctx),
  };
}
export type AdminServices = ReturnType<typeof createAdminServices>;
