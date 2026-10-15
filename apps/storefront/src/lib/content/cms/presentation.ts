import type { Content } from './schema';

export const HOME_SECTION_KEYS = ['story','ritual','feature','collection','moments','why','journal','community'] as const;
export type HomeSection = typeof HOME_SECTION_KEYS[number];
export const DEFAULT_SECTION_ORDER = HOME_SECTION_KEYS.join(',');
export function validSectionOrder(value: string): boolean {
  const keys = value.split(',').map(key => key.trim());
  return keys.length === HOME_SECTION_KEYS.length && new Set(keys).size === keys.length && keys.every(key => HOME_SECTION_KEYS.includes(key as HomeSection));
}
export function homeSections(content: Content): HomeSection[] {
  const order = validSectionOrder(content.sectionOrder ?? '') ? content.sectionOrder : DEFAULT_SECTION_ORDER;
  return order.split(',').map(key => key.trim() as HomeSection).filter(key => key === 'collection' || content[`${key}Visible`] !== 'false');
}
export function paragraphs(text: string): string[] {
  return text.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
}
export function validImagePosition(value: string): boolean {
  return /^(?:100|\d{1,2}) (?:100|\d{1,2})$/.test(value);
}
export function imagePosition(content: Content, key: string): { objectPosition: string } {
  const value = content[`${key}Position`] ?? '50 50';
  const [x,y] = (validImagePosition(value) ? value : '50 50').split(' ').map(Number);
  return {objectPosition:`${x}% ${y}%`};
}

export function validImageSource(value:string):boolean {
  return value==='' || /^\/remedy\/[a-zA-Z0-9_-]+\.(png|jpg|webp|avif)$/.test(value) || /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
export function imageEditorDefaults(name:string,image:string,position:string,values?:Record<string,string>) {
  const submitted=values?.[name]??image;
  const x=values?.[`${name}PositionX`],y=values?.[`${name}PositionY`];
  const point=x!==undefined&&y!==undefined?`${x} ${y}`:values?.[`${name}Position`]??position;
  return {image:validImageSource(submitted)?submitted:image,position:validImagePosition(point)?point:validImagePosition(position)?position:'50 50'};
}
