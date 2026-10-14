'use client';
import { useEffect, useRef, useState } from 'react';
import type { Content } from '@/lib/content/cms/schema';
export function RemedyMotion() {
    useEffect(() => {
        const root = document.querySelector<HTMLElement>('.remedy-home');
        if (!root)
            return;
        const media = matchMedia('(prefers-reduced-motion: reduce)');
        const nodes = root.querySelectorAll<HTMLElement>('.reveal');
        const observer = new IntersectionObserver(entries => { for (const e of entries)
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                observer.unobserve(e.target);
            } }, { threshold: .08 });
        if (!media.matches) {
            root.classList.add('motion-ready');
            nodes.forEach(n => observer.observe(n));
        }
        let frame = 0;
        const update = () => { frame = 0; if (media.matches)
            return; const hero = root.querySelector<HTMLElement>('.hero'); if (!hero)
            return; const progress = Math.max(0, Math.min(1, -hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight - innerHeight))); const first = root.querySelector<HTMLElement>('.glowing'), second = root.querySelector<HTMLElement>('.skin'), model = root.querySelector<HTMLElement>('.hero-model'); if (first)
            first.style.transform = `translateX(${-75 * progress}px)`; if (second)
            second.style.transform = `translateX(${70 * progress}px)`; if (model)
            model.style.transform = `translateX(-50%) translateY(${25 * progress}px) scale(${1 + .055 * progress})`; root.querySelectorAll<HTMLElement>('[data-drift]').forEach(n => { const p = Math.max(-1, Math.min(1, (innerHeight / 2 - n.getBoundingClientRect().top) / innerHeight)); n.style.transform = `translateX(${p * 80 * Number(n.dataset.drift)}px)`; }); };
        const scroll = () => { if (!frame)
            frame = requestAnimationFrame(update); };
        const reduced = () => { if (media.matches) {
            root.classList.remove('motion-ready');
            root.querySelectorAll<HTMLElement>('.glowing,.skin,.hero-model,[data-drift]').forEach(n => n.style.removeProperty('transform'));
        }
        else {
            root.classList.add('motion-ready');
            nodes.forEach(n => observer.observe(n));
            scroll();
        } };
        window.addEventListener('scroll', scroll, { passive: true });
        window.addEventListener('resize', scroll);
        media.addEventListener('change', reduced);
        scroll();
        return () => { observer.disconnect(); root.classList.remove('motion-ready'); cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll); media.removeEventListener('change', reduced); };
    }, []);
    return null;
}
export function Routine({ c }: {
    c: Content;
}) {
    const [step, setStep] = useState(0);
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);
    return <section className="routine section" id="ritual"><div className="section-heading reveal"><span className="eyebrow">Less rush. More ritual.</span><h2>{c.ritualTitle}</h2></div><div className="routine-images">{[0, 1, 2].map(i => <button key={i} className={`routine-image reveal ${step === i ? 'active' : ''}`} onClick={() => setStep(i)} aria-label={`Explore ${c[`step${i}Title`]}`} aria-pressed={step === i}>{c[`step${i}Image`] ? <img src={c[`step${i}Image`]} alt={c[`step${i}Title`]} loading="lazy"/> : null}<span>0{i + 1}</span></button>)}</div><div className="routine-tabs" role="tablist" aria-label="Skincare routine">{[0, 1, 2].map(i => <button key={i} ref={node => { tabs.current[i] = node; }} type="button" role="tab" id={`step${i}`} aria-selected={step === i} aria-controls="stepPanel" tabIndex={step === i ? 0 : -1} className={step === i ? 'active' : ''} onClick={() => setStep(i)} onKeyDown={e => { let next: number | undefined; if (e.key === 'ArrowRight')
        next = (i + 1) % 3; if (e.key === 'ArrowLeft')
        next = (i + 2) % 3; if (e.key === 'Home')
        next = 0; if (e.key === 'End')
        next = 2; if (next !== undefined) {
        e.preventDefault();
        setStep(next);
        tabs.current[next]?.focus();
    } }}>{c[`step${i}Title`]}</button>)}</div><p className="step-description" id="stepPanel" role="tabpanel" aria-labelledby={`step${step}`} tabIndex={0}>{c[`step${step}Text`]}</p></section>;
}
