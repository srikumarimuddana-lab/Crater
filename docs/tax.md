# Sales tax, timezone, staff and stock reasons

Status: owner decisions recorded 2026-10-09. This is how the software is configured. It is
not tax or legal advice: the owner's accountant should confirm registrations, product
taxability and filing before live sales.

## Owner decisions

| Topic | Decision |
| --- | --- |
| Store timezone | `America/Regina` (Saskatchewan; no daylight saving) |
| Business location | Saskatchewan; sells online within Canada |
| Tax registrations | GST (federal) and Saskatchewan PST |
| Cost price | Tracked per variant; required before a product can be published |
| Staff | Two people: the Owner and one Fulfilment staff member (confirmed 2026-10-09) |
| Stock-adjustment reasons | Chosen by the architect (below) |

## How tax is calculated (free; no Stripe Tax)

The shopper chooses a **ship-to province** in the bag. Crater computes the tax for that
province and shows it before checkout. At checkout each Stripe line item carries fixed
Stripe Tax Rate objects for those components, so Stripe charges exactly what the bag showed.

Why not automatic address-based rates:
- Stripe's `dynamic_tax_rates` for Checkout has been removed from the API. It is listed as
  "limited-use and is being deprecated" in the stripe-node changelog.
- Stripe Tax does this automatically for 0.5% per transaction where registered (CA pricing
  page). It can replace this later with one setting, if the owner prefers.

Safeguard: Stripe collects the shipping address. The webhook compares the collected province
with the bag's province. On a mismatch the order is created but flagged `TAX_PROVINCE_MISMATCH`
and held (financial status PENDING) for staff review: refund, or contact the customer.

Rounding: tax is computed per line item in cents (half-up), matching Stripe's line-level
calculation. The webhook records Stripe's tax amounts as the authority and flags a difference
larger than 1 cent per line.

## Rate table (configuration)

Source: CRA "GST/HST calculator (and rates)", rates effective on or after 2025-04-01. The
Saskatchewan PST rate of 6% comes from saskatchewan.ca, Provincial Sales Tax.

| Ship-to province | Components charged by Crater |
| --- | --- |
| Saskatchewan | GST 5% + PST (Saskatchewan) 6% |
| Ontario | HST 13% |
| Nova Scotia | HST 14% |
| New Brunswick, Newfoundland and Labrador, Prince Edward Island | HST 15% |
| Alberta, British Columbia, Manitoba, Quebec, Northwest Territories, Nunavut, Yukon | GST 5% |

- Crater does **not** collect BC PST, Manitoba RST or Quebec QST. It is registered only for
  GST and SK PST. Whether out-of-province registrations are needed is an accountant question.
- All products are treated as taxable for GST/HST and SK PST. The accountant should confirm
  this for herbal extracts and body oils: some health products have special treatment.
- Shipping charges, once the owner sets them, are taxed like the goods. To confirm.

## Stock-adjustment reasons

| Reason | Sign | Who | Meaning |
| --- | --- | --- | --- |
| RECEIVED | + | all stock roles | New stock from production or a supplier |
| COUNT_CORRECTION | ± | all stock roles | A physical count differs from the system |
| DAMAGED | − | all stock roles | Broken, leaking or unsellable |
| EXPIRED | − | all stock roles | Past best-before or lot expiry |
| RETURN_RESTOCK | + | Owner, Admin | A customer return put back on the shelf |
| SAMPLES_GIFTS | − | Owner, Admin | Samples, gifts or marketing use |
| LOST_STOLEN | − | Owner, Admin | Missing or stolen |
| OTHER | ± | Owner, Admin | Anything else; a note is required |

For the Slice 2 ledger, cost-based write-offs map as follows:
- DAMAGED, EXPIRED and LOST_STOLEN go to inventory shrinkage.
- SAMPLES_GIFTS goes to marketing.

## Staff

- The Owner is created with `npm run admin:create-owner`.
- The second staff member is created with `npm run admin:create-staff -- --role <ROLE>`,
  with the password typed on stdin and an authenticator set up at first sign-in.
- Confirmed: the second staff member is **FULFILMENT**:
  `npm run admin:create-staff -- --role FULFILMENT --email <their email>`. They see orders
  without prices, packing slips, and inventory with the stock-role reasons.
