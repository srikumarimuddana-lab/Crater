/**
 * Brand facts supplied by the owner (2026-10-11): The Creator's Remedy, a Saskatchewan company shipping
 * across Canada. Nothing here is a product or health claim. The logo is the customer's own file, used as
 * supplied (see public/brand/README.md); the text wordmark is only the fallback until the file is added.
 */
export const brand = {
  name: "The Creator's Remedy",
  /** Short form for tight spaces (packshot labels). */
  short: 'TCR',
  tagline: 'Rooted on the Prairies.',
  region: 'Saskatchewan',
  canadianTags: ['Proudly Canadian', 'Saskatchewan-born', 'Coast to coast'] as const,
  copyright: `© ${new Date().getFullYear()} The Creator's Remedy`,
} as const;
