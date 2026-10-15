import { it, expect } from 'vitest';
import { issueBookingVisitor, validBookingVisitor } from '@/lib/booking/tokens';
it('issues a signed pre-submission identity recoverable even if reservation response is lost', () => {
  process.env.BOOKING_TOKEN_ENCRYPTION_KEY = '11'.repeat(32);
  const token = issueBookingVisitor();
  expect(validBookingVisitor(token)).toBe(true);
  expect(validBookingVisitor(token.slice(0, -1) + '!')).toBe(false);
  expect(validBookingVisitor('customer@example.com')).toBe(false);
});
