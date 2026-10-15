export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type Window = { startMinute: number; endMinute: number };
export type BookingResource = {
  id: string;
  name: string;
  active: boolean;
  weekly: (Window & { weekday: number })[];
  exceptions: { date: string; windows: Window[] }[];
  version: number;
};
export type BookingService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  resourceIds: string[];
  active: boolean;
  version: number;
};
export type BookingSettings = {
  enabled: boolean;
  timezone: string;
  heading: string;
  intro: string;
  staffEmails: string[];
  minimumNoticeMinutes: number;
  horizonDays: number;
  cancellationNoticeMinutes: number;
  reminderMinutes: number;
  retentionDays: number;
  version: number;
};
export type Slot = {
  serviceId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};
export type Booking = {
  id: string;
  reference: string;
  serviceId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  busyStartsAt: string;
  busyEndsAt: string;
  timezone: string;
  serviceName: string;
  name: string;
  email: string;
  notes: string;
  status: BookingStatus;
  mode: 'test' | 'live';
  version: number;
  createdAt: string;
  updatedAt: string;
  tokenHash: string;
  encryptedToken: string;
  tokenExpiresAt: string;
  customerId?: string;
  anonymizedAt?: string;
};
export type BookingEvent = {
  id: string;
  bookingId: string;
  version: number;
  kind: 'confirmed' | 'rescheduled' | 'cancelled' | 'reminder';
  processed?: boolean;
  snapshot: Booking;
  createdAt: string;
};
export type BookingState = {
  settings: BookingSettings;
  resources: BookingResource[];
  services: BookingService[];
  bookings: Booking[];
  events: BookingEvent[];
  requests: {
    key: string;
    digest: string;
    bookingId: string;
    result: Booking;
  }[];
  audit: { actor: string; action: string; target: string; at: string }[];
};
