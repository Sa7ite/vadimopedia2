import { launch, page, go, USER } from './lib.mjs';
const b = await launch(); const u = await page(b, USER, 390, 844); await go(u, 'chat');
console.log(await u.evaluate(() => [...document.querySelectorAll('.chat-container, .chat-messages, #form-chat-message')].map(e => `${e.className||e.id}: sw=${e.scrollWidth} cw=${e.clientWidth} sl=${e.scrollLeft}`).join('\n')));
await u.fill('#chat-message-text', 'x'); 
console.log(await u.evaluate(() => [...document.querySelectorAll('.chat-container')].map(e => `after fill sl=${e.scrollLeft}`).join()));
await u.screenshot({ path: '/data/work/chat-general-390.png', fullPage: true }); await b.close(); process.exit(0);
