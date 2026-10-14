export type Content = Record<string, string>;
export type ContentField = {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'image' | 'url';
    value: string;
};
const field = (key: string, label: string, value: string, type: ContentField['type'] = 'text'): ContentField => ({ key, label, value, type });
export const contentSchemas: Record<string, {
    title: string;
    path: string;
    fields: ContentField[];
}> = {
    global: { title: 'Brand, navigation & footer', path: '/', fields: [
            field('brand', 'Brand name', 'craters'), field('brandSecond', 'Brand second line', 'remedy'),
            field('logo', 'Logo image (optional)', '', 'image'), field('announcement', 'Announcement', 'A daily ritual. A little more you.'),
            field('shopLabel', 'Shop navigation', 'Shop'), field('storyLabel', 'Story navigation', 'Our story'), field('journalLabel', 'Journal navigation', 'Journal'),
            field('footerTitle', 'Footer heading', 'A daily ritual.\nA little more you.', 'textarea'), field('footerText', 'Footer introduction', 'Considered care for everyday rituals.', 'textarea'),
            field('supportEmail', 'Support email', ''), field('instagram', 'Instagram URL', '', 'url'),
            field('newsletterTitle', 'Newsletter heading', 'A little care in your inbox.'), field('newsletterText', 'Newsletter description', 'Stories, new arrivals and everyday inspiration. Subscribe to email updates.', 'textarea'),
            field('newsletterImage', 'Newsletter background', '/remedy/footer.jpg', 'image'),
        ] },
    home: { title: 'Homepage', path: '/', fields: [
            field('heroTitle', 'Hero first line', 'Glowing'), field('heroSecond', 'Hero second line', 'Skin'),
            field('heroText', 'Hero description', 'Care for yourself.\nCome back to your glow.', 'textarea'),
            field('heroButton', 'Hero button', 'Discover your ritual'), field('heroLink', 'Hero button destination', '/#collection', 'url'),
            field('heroImage', 'Hero portrait', '/remedy/hero-model.png', 'image'), field('heroAlt', 'Hero image description', 'Skincare portrait'),
            field('heroTexture', 'Hero background', '/remedy/hero-texture.jpg', 'image'), field('marquee', 'Moving banner text', 'Care / Ritual / Everyday / Balance / Beauty / Your moment /'),
            field('storyEyebrow', 'Story eyebrow', 'A little care. Every day.'), field('storyTitle', 'Story heading', 'Good skin days.\nBetter everyday rituals.', 'textarea'),
            field('storyText', 'Story description', 'Simple moments, considered care. Find a routine that feels like you and make a little room for yourself.', 'textarea'),
            field('storyImage', 'Story image', '/remedy/story.jpg', 'image'), field('storyAlt', 'Story image description', 'A quiet skincare ritual'),
            field('storyDetail', 'Story detail image', '/remedy/detail.jpg', 'image'), field('storyCaption', 'Story caption', 'A moment, just for you.'),
            field('ritualTitle', 'Ritual heading', 'Three steps.\nYour kind of glow.', 'textarea'),
            ...['Cleanse', 'Care', 'Moisturize'].flatMap((title, i) => [field(`step${i}Title`, `Step ${i + 1} title`, title), field(`step${i}Text`, `Step ${i + 1} description`, ['Begin with a fresh start. Choose a cleanser that suits your skin and follow its directions.', 'Choose care that fits your preferences. Introduce new products one at a time.', 'Finish with a little comfort and enjoy a quiet moment before moving on.'][i], 'textarea'), field(`step${i}Image`, `Step ${i + 1} image`, `/remedy/${['cleanse', 'treat', 'moisturize'][i]}.jpg`, 'image')]),
            field('featureImage', 'Feature image', '/remedy/feature.jpg', 'image'), field('featureTitle', 'Feature heading', 'Make everyday a little extraordinary.'),
            field('collectionTitle', 'Collection heading', 'The collection'), field('collectionText', 'Collection introduction', 'Meet your new routine.'),
            field('whyTitle', 'Philosophy heading', 'Why care?'), field('whyImage', 'Philosophy background', '/remedy/why.jpg', 'image'),
            field('whyText', 'Philosophy statements (one per line)', 'Because small rituals matter.\nBecause simple can be beautiful.\nBecause it’s personal.\nBecause everyday deserves care.', 'textarea'),
            field('journalTitle', 'Journal heading', 'A little inspiration.'),
            field('momentsTitle', 'Moments heading', 'Care looks good on you.'), field('momentsText', 'Moments introduction', 'For slow mornings, quiet evenings, and everything in between.'),
            ...['A fresh start.', 'A softer ending.', 'Your moment.'].flatMap((title, i) => [field(`moment${i}Title`, `Moment ${i + 1} heading`, title), field(`moment${i}Text`, `Moment ${i + 1} text`, ['A few unhurried minutes before the day begins.', 'Wash away the day. Come back to yourself.', 'A little attention can make an ordinary day feel special.'][i], 'textarea')]),
            ...['Making room for a daily ritual', 'A routine that feels like you', 'The art of slowing down'].flatMap((title, i) => [field(`article${i}Title`, `Journal card ${i + 1} title`, title), field(`article${i}Image`, `Journal card ${i + 1} image`, `/remedy/social${i + 1}.jpg`, 'image'), field(`article${i}Body`, `Journal article ${i + 1}`, ['Choose a familiar moment in your day and give it a little attention. Keep your routine simple enough to enjoy. A few unhurried minutes can be a welcome pause.', 'Start with your preferences and the directions supplied with each product. Introduce new products one at a time and make room for a routine you look forward to.', 'Leave a little space between the things you do. A quiet morning or a slower evening can be a moment to come back to yourself.'][i], 'textarea')]),
            field('communityTitle', 'Community heading', 'Your ritual. Your remedy.'), field('communityText', 'Community introduction', 'A little everyday inspiration.'),
            ...[1, 2, 3, 4].map(i => field(`social${i}Image`, `Community image ${i}`, `/remedy/social${i}.jpg`, 'image')),
        ] },
};
const pages: [
    string,
    string,
    string,
    string
][] = [
    ['about', 'Our story', 'Care, considered.', 'We believe in making a little room for yourself. Explore everyday rituals and thoughtfully considered products.'],
    ['ingredients-sourcing', 'Ingredients & sourcing', 'Know your everyday care.', 'Ingredient and sourcing details are listed on each product. Contact us with questions about the products in your routine.'],
    ['contact', 'Contact', 'Let’s talk.', 'Questions about a product or an order? Send a message to our team.'],
    ['shipping-returns', 'Shipping & returns', 'The details, thoughtfully handled.', 'Shipping options and rates are shown at checkout. Contact our team for help with returns or an existing order.'],
    ['privacy', 'Privacy', 'Your privacy.', 'Privacy policy content has not been supplied yet.'],
    ['terms', 'Terms', 'Terms of service.', 'Terms of service content has not been supplied yet.'],
    ['journal', 'Journal', 'The everyday journal.', 'Small rituals and inspiration for everyday care.'],
];
for (const [key, title, heading, body] of pages)
    contentSchemas[key] = { title, path: `/${key}`, fields: [field('title', 'Heading', heading), field('intro', 'Introduction', '', 'textarea'), field('body', 'Page text (paragraphs separated by blank lines)', body, 'textarea'), field('image', 'Page image', key === 'about' ? '/remedy/story.jpg' : '', 'image'), field('imageAlt', 'Image description', title), field('seoTitle', 'Search title', title), field('seoDescription', 'Search description', body)] };
for (const [key, title, path] of [['cart', 'Shopping bag', '/cart'], ['checkout-success', 'Order confirmation', '/checkout/success'], ['admin', 'Admin help', '/admin']] as const)
    contentSchemas[key] = { title, path, fields: [field('title', 'Heading', title), field('body', 'Help text', '', 'textarea'), field('image', 'Supporting image', '', 'image'), field('imageAlt', 'Image description', '')] };
export function defaultsFor(key: string): Content {
    const schema = contentSchemas[key];
    if (!schema)
        throw new Error('Unknown page.');
    return Object.fromEntries(schema.fields.map(f => [f.key, f.value]));
}
export function safeLink(value: string): boolean {
    if (!value)
        return true;
    if (/^\/(?!\/)[a-zA-Z0-9/?#=&_%+.-]*$/.test(value))
        return true;
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password;
    }
    catch {
        return false;
    }
}
export function safeImage(value: string): boolean {
    return value === '' || /^\/remedy\/[a-zA-Z0-9_-]+\.(png|jpg|webp|avif)$/.test(value) || /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
export function validateContent(key: string, input: unknown): Content {
    const schema = contentSchemas[key];
    if (!schema || !input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid content.');
    const data = input as Record<string, unknown>;
    if (Object.keys(data).some(k => !schema.fields.some(f => f.key === k)))
        throw new Error('Unknown editable field.');
    const output: Content = {};
    for (const f of schema.fields) {
        const value = data[f.key] ?? f.value;
        if (typeof value !== 'string' || value.length > (f.type === 'textarea' ? 20000 : 500) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
            throw new Error(`Invalid ${f.label}.`);
        if (f.type === 'url' && !safeLink(value))
            throw new Error(`${f.label} must be a local path or HTTPS URL.`);
        if (f.type === 'image' && !safeImage(value))
            throw new Error(`${f.label} must be selected from the media library.`);
        output[f.key] = value.trim();
    }
    return output;
}
