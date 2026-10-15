import type { ImgHTMLAttributes } from 'react';
import type { Content } from '@/lib/content/cms/schema';
import { imagePosition } from '@/lib/content/cms/presentation';

/** Sources are validated CMS assets; optimized bytes retain private-media access rules. */
export function ContentImage({ content, field, alt='', style, ...props }: { content:Content; field:string } & Omit<ImgHTMLAttributes<HTMLImageElement>,'src'|'content'>) {
  if (!content[field]) return null;
  return <img {...props} src={content[field]} alt={alt} style={{...imagePosition(content,field),...style}} />;
}
