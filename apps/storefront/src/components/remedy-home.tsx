import Link from 'next/link';
import type { Content } from '@/lib/content/cms/schema';
import type { getJournalArticles } from '@/lib/content/cms/journal';
import { ContentImage } from './content-image';
import { RemedyMotion } from './remedy-motion';
export type JournalArticles=Awaited<ReturnType<typeof getJournalArticles>>;

export function RemedyHero({c}:{c:Content}) {
  return <><RemedyMotion/><section className="hero" id="home" aria-labelledby="heroTitle"><div className="hero-scene">
    <ContentImage content={c} field="heroTexture" className="hero-texture" alt="" fetchPriority="high"/><div className="hero-shade"/>
    <h1 id="heroTitle"><span className="glowing">{c.heroTitle}</span><span className="skin">{c.heroSecond}</span></h1>
    <div className="hero-copy"><p>{c.heroText}</p><Link className="text-link light" href={c.heroLink||'/#collection'} data-track="home.hero.shop">{c.heroButton} <span>↗</span></Link></div>
    <ContentImage content={c} field="heroImage" className="hero-model" alt={c.heroAlt} fetchPriority="high"/>
    <a href={c.storyVisible==='false'?'#collection':'#story'} className="scroll-hint">{c.scrollLabel} <span>↓</span></a>
    <div className="marquee" aria-hidden="true"><div>{Array(4).fill(c.marquee).join(' ')}</div></div>
  </div></section></>;
}
export function RemedyStory({c}:{c:Content}) {
  return <section className="story section" id="story"><div className="story-art reveal"><ContentImage content={c} field="storyImage" className="story-main" alt={c.storyAlt} loading="lazy"/><ContentImage content={c} field="storyDetail" className="story-detail" alt={c.detailAlt} loading="lazy"/><span className="image-caption">{c.storyCaption}</span></div><div className="story-copy"><span className="eyebrow reveal">{c.storyEyebrow}</span><h2 className="reveal">{c.storyTitle}</h2><p className="reveal">{c.storyText}</p><Link className="pill reveal" href="/about" data-track="home.hero.story">{c.storyButton} <span>↗</span></Link></div></section>;
}
export function RemedyFeature({c}:{c:Content}) {
  return <section className="feature section"><div className="feature-photo reveal"><ContentImage content={c} field="featureImage" alt={c.featureTitle} loading="lazy"/><Link className="feature-cta" href={c.featureLink||'/journal'} aria-label={c.featureLinkLabel}>↗</Link><span>{c.featureTitle}</span></div><div className="kinetic" aria-label={`${c.kineticFirst} ${c.kineticSecond}`}><div data-drift="1">{c.kineticFirst}</div><div data-drift="-1">{c.kineticSecond}</div></div></section>;
}
export function RemedyMoments({c}:{c:Content}) {
  return <section className="moments section"><div className="section-heading reveal"><h2>{c.momentsTitle}</h2><p>{c.momentsText}</p></div><div className="moment-grid">{[0,1,2].map(i=><article className="moment reveal" key={i}><span>0{i+1} / {c[`moment${i}Label`]}</span><h3>{c[`moment${i}Title`]}</h3><p>{c[`moment${i}Text`]}</p></article>)}</div></section>;
}
export function RemedyWhy({c}:{c:Content}) {
  return <section className="why"><ContentImage content={c} field="whyImage" alt="" loading="lazy"/><div className="why-shade"/><div className="why-content section"><h2 className="reveal">{c.whyTitle}</h2><div className="why-list">{c.whyText.split(/\r?\n/).filter(Boolean).map((line,i)=><article className="reveal" key={i}><span>0{i+1}</span><h3>{line}</h3></article>)}</div></div></section>;
}
export function RemedyJournal({c,articles}:{c:Content;articles:JournalArticles}) {
  return <section className="journal section" id="journal"><div className="row-heading reveal"><div><span className="eyebrow">{c.journalEyebrow}</span><h2>{c.journalTitle}</h2></div><Link href="/journal">{c.journalButton} ↗</Link></div><div className="journal-grid">{articles.map(article=><Link key={article.key} className="journal-card reveal" href={article.href} data-track="home.journal.read"><ContentImage content={article.content} field="image" alt={article.content.imageAlt} loading="lazy"/><span>{c.articleCategory}</span><h3>{article.content.title} <b>↗</b></h3></Link>)}</div></section>;
}
export function RemedyCommunity({c}:{c:Content}) {
  return <section className="community section"><div className="section-heading reveal"><h2>{c.communityTitle}</h2><p>{c.communityText}</p></div><div className="social-grid">{[1,2,3,4].map(i=><ContentImage key={i} content={c} field={`social${i}Image`} className="reveal" alt={c[`social${i}Alt`]} loading="lazy"/>)}</div></section>;
}
