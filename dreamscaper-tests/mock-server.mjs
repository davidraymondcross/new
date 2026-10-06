// Minimal stand-in for WordPress so the DreamScaper app can be driven in a real browser.
// Serves the plugin files and fakes the REST routes the 2.5 screens use (in memory).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dreamscaper');
const PORT = +process.env.PORT || 8787;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const now = () => Date.now();
const db = { clients: [], props: [], quotes: [], visits: [], invoices: [], followups: [], activity: [], myprops: [], settings: {}, id: 100 };
const nid = () => ++db.id;
const pro = { id: 1, business: "David's Landscaping", contact: 'David', phone: '(860) 555-0100', email: 'david@example.com', town: 'Farmington', state: 'CT', logo: '', rating: 4.8, reviews: 12, reality: 4.7, reality_n: 9, jobs: 14, services: ['Planting', 'Patios & walkways'], insured: true, licensed: true, years: 12, radius: 25, pay: false };
const session = () => ({
	user: { id: 1, name: 'David Cross', email: 'david@example.com', phone: '8605550100', address: '12 Main St', town: 'Farmington', zip: '06032', complete: true, owner: true, avatar: '' },
	nonce: 'n', ai: { enabled: true, left: 10, limit: 10, identify: true, segment: true }, socials: [], storage: { used: 0, limit: 300 * 1048576 },
	community: { on: true, unread: { notes: 0, msgs: 0 }, points: 10, total: 10, level: { n: 1, name: 'Seedling', emoji: '🌱' }, me: { id: 1, name: 'David C.' } },
	crm: { on: true, sms: true, pay: true, pro: { status: 'approved', business: pro.business, requests: db.quotes.filter((q) => q.status === 'request').length }, portal: { quotes: 1, invoices: 0 } }
});
const quoteOut = (q, full) => ({ ...q, client: (db.clients.find((c) => c.id === q.client_id) || {}).name || '', thumb: (q.design || {}).after || '', link: 'http://localhost:' + PORT + '/?ds_quote=' + q.token, ...(full ? { followups: db.followups.filter((f) => f.quote_id === q.id), visits: db.visits.filter((v) => v.quote_id === q.id), invoices: db.invoices.filter((i) => i.quote_id === q.id), contacts: (() => { const c = db.clients.find((x) => x.id === q.client_id); return c ? [{ name: c.name, email: c.email, phone: c.phone, role: 'Customer' }, ...((c.data && c.data.contacts) || [])] : []; })() } : {}) });
const clientFull = (c) => ({ ...c, properties: db.props.filter((p) => p.client_id === c.id), quotes: db.quotes.filter((q) => q.client_id === c.id).map((q) => quoteOut(q)), invoices: db.invoices.filter((i) => i.client_id === c.id), activity: db.activity.filter((a) => a.client_id === c.id) });

function route(method, p, q, b) {
	const log = (client_id, quote_id, kind, text) => db.activity.unshift({ id: nid(), client_id, quote_id, kind, text, at: now() });
	switch (`${method} ${p}`) {
	case 'GET c/status': return session().community;
	case 'GET cloud/list': return { items: [] };
	case 'GET crm/application': return { pro: { ...pro, status: 'approved' } };
	case 'GET crm/me': return { pro, settings: db.settings, pipeline: db.quotes.reduce((a, x) => { a[x.status] = a[x.status] || { n: 0, v: 0 }; a[x.status].n++; a[x.status].v += x.total || 0; return a; }, {}), close_rate: 40, leads: 1, clients: db.clients.length, unpaid: 0, paid30: 1200, upcoming: db.visits.slice(0, 5), recent: db.activity.slice(0, 10), reviews: [{ id: 1, stars: 5, reality: 5, text: 'Exactly like the design!', photo: '', reply: '', at: now() - 86400000, by: { name: 'Jane S.' }, project: 'Front yard', design: '' }], sms: true, connect: { on: true, ready: false, started: false, fee: 0 } };
	case 'POST crm/settings': Object.assign(db.settings, b); return { settings: db.settings };
	case 'GET crm/clients': return { items: db.clients.filter((c) => (!q.stage || c.stage === q.stage) && (!q.q || JSON.stringify(c).toLowerCase().includes(q.q.toLowerCase()))) };
	case 'GET crm/client': { const c = db.clients.find((x) => x.id === +q.id); return c ? clientFull(c) : { __status: 404, message: 'Customer not found.' }; }
	case 'POST crm/client': {
		if (!b.name || b.name.length < 2) return { __status: 400, message: 'Please add the customer’s name.' };
		let c = db.clients.find((x) => x.id === b.id);
		if (c) Object.assign(c, b, { updated: now() });
		else { c = { ...b, id: nid(), linked: false, created: now(), updated: now(), photo: b.photo ? 'data:image/png;base64,' : '' }; db.clients.push(c); log(c.id, 0, 'lead', 'Customer added'); if (b.address) db.props.push({ id: nid(), client_id: c.id, address: [b.address, b.town, b.state].filter(Boolean).join(', '), lat: 41.73, lng: -72.83, aerial: '', ppf: 0, photos: [], plan: {}, data: {} }); }
		return clientFull(c);
	}
	case 'POST crm/property': { let pr = db.props.find((x) => x.id === b.id); if (!pr) { pr = { id: nid(), photos: [], plan: {}, data: {}, address: '' }; db.props.push(pr); } Object.assign(pr, b); return pr; }
	case 'POST crm/note': log(b.client_id, 0, b.kind, b.text); return { ok: true };
	case 'GET crm/quotes': return { items: db.quotes.filter((x) => !q.status || (q.status === 'jobs' ? x.status === 'signed' : x.status === q.status)).map((x) => quoteOut(x)) };
	case 'GET crm/quote': { const x = db.quotes.find((y) => y.id === +q.id); return x ? quoteOut(x, true) : { __status: 404, message: 'Quote not found.' }; }
	case 'POST crm/quote': {
		let x = db.quotes.find((y) => y.id === b.id);
		const t = (b.docs && b.docs.totals) || {};
		if (!x) { x = { id: nid(), number: 'Q-' + (1000 + db.quotes.length + 1), status: 'draft', job_status: '', token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), design: {}, estimate: {}, docs: {}, job: {}, sign: {}, created: now() }; db.quotes.push(x); log(b.client_id, x.id, 'quote', 'Quote started'); }
		Object.assign(x, { ...b, id: x.id, price: t.price || 0, cost: t.cost || 0, total: t.total || 0, updated: now() });
		if (b.design) x.design = b.design;
		return quoteOut(x, true);
	}
	case 'POST crm/quote/send': {
		const x = db.quotes.find((y) => y.id === b.id);
		x.status = 'sent'; x.sent = now();
		db.followups = db.followups.filter((f) => f.quote_id !== x.id);
		for (const f of b.followups || []) db.followups.push({ ...f, id: nid(), quote_id: x.id, status: 'scheduled' });
		db.lastSend = b;
		log(x.client_id, x.id, 'sent', 'Quote sent');
		return { ok: true, sent: b.recipients.length, errors: [], quote: quoteOut(x, true) };
	}
	case 'POST crm/followups': { const x = db.quotes.find((y) => y.id === b.quote_id); db.followups = db.followups.filter((f) => f.quote_id !== x.id); for (const f of b.items) db.followups.push({ ...f, id: nid(), quote_id: x.id, status: 'scheduled' }); return { scheduled: b.items.length, quote: quoteOut(x, true) }; }
	case 'POST crm/elevation': return { elev: {}, slope: 4.2, class: 'gentle', downhill: 'south' };
	case 'GET crm/schedule': return { items: db.visits, jobs: db.quotes.filter((x) => x.status === 'signed').map((x) => quoteOut(x)), crew: [] };
	case 'POST crm/visit': { let v = db.visits.find((x) => x.id === b.id); if (!v) { v = { id: nid() }; db.visits.push(v); } Object.assign(v, b, { id: v.id }); return v; }
	case 'GET crm/invoices': return { items: db.invoices };
	case 'POST crm/invoice': { let i = db.invoices.find((x) => x.id === b.id); if (!i) { i = { id: nid(), number: 'INV-' + (1000 + db.invoices.length + 1), status: 'draft', link: 'http://x/?ds_invoice=t' }; db.invoices.push(i); } Object.assign(i, b, { id: i.id, amount: b.items.reduce((s, x) => s + x.qty * x.rate, 0) }); if (b.status) i.status = b.status; return i; }
	case 'POST crm/invoice/send': { const i = db.invoices.find((x) => x.id === b.id); i.status = 'sent'; return i; }
	case 'GET crm/pros': return { items: [{ ...pro, miles: 2.1, serves: true }, { ...pro, id: 2, business: 'Green Acres Hardscape', rating: 4.5, reviews: 30, reality: 4.2, reality_n: 18, miles: 8.4, serves: true }], near: q.near || 'Farmington', located: true };
	case 'GET crm/pro': return { ...pro, id: +q.id, bio: 'Family-owned since 2013.', website: 'https://example.com', since: now() - 3e10, stars: { 5: 10, 4: 2 }, reviews_list: [{ id: 1, stars: 5, reality: 5, text: 'Exactly like my Dreamscape.', photo: '', reply: 'Thank you!', at: now() - 864e5, by: { name: 'Jane S.' }, project: 'Front yard', design: '', before: '' }], portfolio: [] };
	case 'GET crm/portal': return { items: [{ id: 55, number: 'Q-1009', title: 'Backyard patio', status: 'sent', job_status: '', pro, total: 8450, before: '', after: '', link: 'http://x', sections: [], visits: [], invoices: [], reviewed: false, created: now() }, { id: 56, number: 'Q-1002', title: 'Front beds', status: 'signed', job_status: 'done', pro, total: 2450, before: '', after: '', link: 'http://x', sections: [{ title: 'Mulch', scope: ['Install 4 yd³'], optional: false }], visits: [{ title: 'Install', start: now() - 864e5 * 3, end: now() - 864e5 * 3 + 4 * 3600e3, status: 'done' }], invoices: [{ number: 'INV-1', title: 'Deposit', amount: 735, status: 'paid', link: 'http://x' }], reviewed: false, created: now() }], hired: [{ pro, jobs: [{ id: 56, title: 'Front beds', status: 'done', total: 2450 }] }], invoices: [] };
	case 'GET crm/myproperty': return { items: db.myprops };
	case 'POST crm/myproperty': { let pr = db.myprops.find((x) => x.id === b.id); if (!pr) { pr = { id: nid(), photos: [], plan: {}, data: {}, address: '' }; db.myprops.push(pr); } Object.assign(pr, b, { id: pr.id }); return pr; }
	case 'POST crm/request': db.lastRequest = b; return { ok: true, quote: 77 };
	case 'POST ai/ask': db.lastAsk = b; return { instruction: 'Add a curved bed of white hydrangeas along the front foundation, edged in steel, with dark brown mulch. Keep the house and camera angle the same.', scope: 'small', explain: 'A soft curve of hydrangeas will frame your entry and hide the foundation.', note: '' };
	case 'POST ai/analyze': return { summary: 'A tidy front yard with a lot of open lawn and a bare foundation.', items: [{ cat: 'curb_appeal', label: 'Curb appeal', title: 'Frame the front entry', seen: 'bare foundation by the steps', why: 'Layered plants make the door the focal point.', idea: 'Add a curved foundation bed with boxwood and hydrangeas.', priority: 1 }, { cat: 'lighting', label: 'Lighting', title: 'Light the walkway', seen: 'unlit path', why: 'Safer and welcoming at night.', idea: 'Add warm path lights along the walkway.', priority: 2 }] };
	case 'POST ai/explain': return { summary: 'The new beds soften the house.', points: [{ title: 'Softened foundation', why: 'Shrubs hide the concrete and add depth.' }], notes: ['Hydrangeas need morning sun.'] };
	case 'POST ai/style': return { style: 'Relaxed cottage', summary: 'You love soft, layered flowers.', characteristics: ['Layered perennials'], plants: ['Catmint', 'Roses'], materials: ['Fieldstone'], colors: ['Purple', 'White'], prompt: 'Restyle in a relaxed cottage look. Keep the house the same.' };
	case 'POST ai/edit': db.aiImage = b.image; db.edits = (db.edits || 0) + 1; return { job: 'j' + db.edits, ai: { enabled: true, left: 9, limit: 10 } };
	case 'GET ai/job': return { status: 'ready', url: 'http://localhost:' + PORT + '/mock/ai.jpg' };
	case 'POST ai/segment': return { masks: [] };
	case 'POST share': db.lastShare = { ...b, image: (b.image || '').slice(0, 30) }; return { ok: true };
	case 'GET __db': return db;
	default: return method === 'GET' ? { items: [] } : { ok: true };
	}
}

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock site</title></head><body>
<h1>Mock WordPress page</h1><button data-dreamscaper-open id="launch">Start designing</button>
<script type="application/json" id="dreamscaper-config">${JSON.stringify({ api: '/wp-json/dreamscaper/v1/', css: '/plugin/assets/css/dreamscaper.css?ver=2.5.0', brand: "David's Landscaping", shortBrand: 'David', site: 'example.com', mapsKey: '', share: true, owner: true, ajax: '/ajax', home: '/', oauth: '/' })}</script>
<script type="module" src="/plugin/assets/js/app.js?ver=2.5.0"></script></body></html>`;

http.createServer((req, res) => {
	const u = new URL(req.url, 'http://x');
	if (u.pathname === '/' ) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
	if (u.pathname === '/mock/ai.jpg') { const d = db.aiImage || ''; const bin = Buffer.from(d.slice(d.indexOf(',') + 1), 'base64'); res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(bin); }
	if (u.pathname === '/ajax') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(session())); }
	if (u.pathname.startsWith('/plugin/')) {
		const f = path.join(ROOT, u.pathname.slice(8));
		if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
		res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
		return fs.createReadStream(f).pipe(res);
	}
	if (u.pathname.startsWith('/wp-json/dreamscaper/v1/')) {
		let raw = '';
		req.on('data', (c) => (raw += c));
		req.on('end', () => {
			let b = {};
			try { b = raw ? JSON.parse(raw) : {}; } catch (e) { /* form */ }
			const out = route(req.method, u.pathname.slice(24), Object.fromEntries(u.searchParams), b);
			const st = out && out.__status ? out.__status : 200;
			res.writeHead(st, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(out));
		});
		return;
	}
	res.writeHead(404); res.end();
}).listen(PORT, () => console.log('mock on ' + PORT));
