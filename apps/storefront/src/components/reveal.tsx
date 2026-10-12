'use client';

import { useEffect } from 'react';

/**
 * Nuda-style rise-and-fade for `.reveal` elements (and scale-in for `.reveal-zoom`). Nothing is hidden by
 * markup or by CSS alone: once hydrated, and only when motion is allowed, elements still below the viewport
 * are marked pending and animate in when they enter. Without JavaScript, under reduced motion, in print and
 * in screenshots the page is simply complete at rest.
 */
export function RevealObserver() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal, .reveal-zoom'));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = 'in';
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    const bottom = window.innerHeight;
    for (const el of els) {
      if (el.getBoundingClientRect().top > bottom) {
        el.dataset.reveal = 'pending';
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);
  return null;
}
