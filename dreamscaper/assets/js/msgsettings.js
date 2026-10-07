/* DreamScaper – contractor settings: Messages & alerts, Intake questions, Social links & gallery,
 * Quick replies. Each is a tab under Contractor Hub → Settings.
 */
import { h, put, icon } from './util.js?v=2.7.5';
import { api } from './api.js?v=2.7.5';
import { modal, pickFile } from './capture.js?v=2.7.5';
import { sectionHead, lockNote, has, loadCaps, planPrompt, usageBar, tip } from './explain.js?v=2.7.5';

let M = null;
export function initMsgSettings(ctx) { M = { ctx }; }
const toast = (m, ms) => M && M.ctx.toast(m, ms);
const CH = { email: '✉️ Email', sms: '💬 Text', inapp: '🔔 In-app' };

/** Fill tags for the preview: {tag}, {{tag}}, {tag|fallback}; empty tags are highlighted. */
function render(text, codes) {
	const out = [];
	let last = 0;
	const re = /\{\{?\s*([a-z_]+)\s*(?:\|([^{}]*))?\}?\}/gi;
	let m;
	while ((m = re.exec(text))) {
		out.push(text.slice(last, m.index));
		const k = m[1].toLowerCase();
		const v = codes[k];
		if (v != null && v !== '') out.push(h('mark', { class: 'ds-tagv' }, v));
		else if (m[2]) out.push(h('mark', { class: 'ds-tagv' }, m[2]));
		else out.push(h('mark', { class: 'ds-tagv bad', title: 'Unknown tag — it would be left out' }, m[0]));
		last = m.index + m[0].length;
	}
	out.push(text.slice(last));
	return out;
}
const unknownTags = (text, tags) => { const ok = new Set(tags.map((t) => t.tag)); return [...String(text).matchAll(/\{\{?\s*([a-z_]+)\s*(\|[^{}]*)?\}?\}/gi)].map((x) => x[1].toLowerCase()).filter((k) => !ok.has(k)); };
const segments = (s) => { const n = s.length; const gsm = !/[^\x00-\x7F’“”–—•…]/.test(s); const per = gsm ? 160 : 70; return n <= per ? 1 : Math.ceil(n / (gsm ? 153 : 67)); };

/** Tap-to-insert tag chips that type into the last focused field. */
function tagPicker(tags, target) {
	const groups = {};
	for (const t of tags) (groups[t.group] = groups[t.group] || []).push(t);
	const q = h('input', { type: 'search', placeholder: 'Find a detail (name, date, total…)', 'aria-label': 'Find a detail' });
	const box = h('div', { class: 'ds-tagpick' });
	const draw = () => {
		box.innerHTML = '';
		const f = q.value.toLowerCase();
		for (const [g, list] of Object.entries(groups)) {
			const items = list.filter((t) => !f || t.label.toLowerCase().includes(f) || t.tag.includes(f));
			if (!items.length) continue;
			box.append(h('div', { class: 'ds-tagpick-g' }, h('small', null, g), h('div', { class: 'ds-chips ds-chips-sm' }, ...items.map((t) => h('button', { type: 'button', class: 'ds-chip', title: `${t.label} → e.g. ${t.sample}`, onmousedown: (e) => e.preventDefault(), onclick: () => insert(target(), `{${t.tag}}`) }, t.label)))));
		}
	};
	q.addEventListener('input', draw);
	draw();
	return h('details', { class: 'ds-codes', open: true }, h('summary', null, '🔖 Insert a detail — tap one to add it where you were typing'), h('p', { class: 'ds-hint' }, 'Details fill in for each customer. Write “Hi {customer_first_name}” and Jane sees “Hi Jane”. Add a fallback after a bar for when a detail is missing: {customer_first_name|there}.'), q, box);
}
function insert(el, code) {
	if (!el) return;
	const focused = el.getRootNode && el.getRootNode().activeElement === el;
	const s = focused ? (el.selectionStart ?? el.value.length) : el.value.length;
	if (!focused) el.selectionStart = el.selectionEnd = s;
	el.value = el.value.slice(0, s) + code + el.value.slice(el.selectionEnd ?? s);
	el.dispatchEvent(new Event('input'));
	el.focus();
	el.selectionStart = el.selectionEnd = s + code.length;
}

/* ------------------------------------------------------ Messages & alerts */

export async function messagesEditor(pane) {
	pane.append(h('span', { class: 'ds-spin' }));
	let r;
	try { r = await api('crm/templates'); } catch (e) { pane.innerHTML = ''; pane.append(h('p', { class: 'ds-err' }, e.message)); return; }
	pane.innerHTML = '';
	const groups = {};
	for (const t of r.items) (groups[t.group] = groups[t.group] || []).push(t);
	const list = h('div');
	put(pane, sectionHead('messages'), tip('tpl', 'Every message is pre-written and ready to go. Open one to rewrite it in your own words — tap a detail like “Customer’s first name” to drop it in.'),
		!r.sms ? h('p', { class: 'ds-hint' }, '💬 Texting isn’t set up on this website yet, so text versions are saved but not sent.') : !r.sms_plan ? h('p', { class: 'ds-hint' }, '💬 Texts aren’t in your plan, so text versions are saved but not sent.') : null, list);
	const row = (t) => h('button', { class: 'ds-tpl-row' + (t.on ? '' : ' off'), onclick: () => edit(t) },
		h('span', { class: 'ds-grow' }, h('b', null, t.label, t.custom ? h('small', { class: 'ds-qs' }, 'Customized') : null), h('small', null, t.when)),
		h('span', { class: 'ds-tpl-ch' }, t.on ? t.channels.map((c) => CH[c].split(' ')[0]).join(' ') : 'Off'), h('span', { class: 'ds-chev' }, '›'));
	const draw = () => { list.innerHTML = ''; for (const [g, items] of Object.entries(groups)) list.append(h('section', { class: 'ds-hub-card' }, h('h2', null, g === 'Alerts to you' ? '🔔 Alerts to you' : g), g === 'Alerts to you' ? h('p', { class: 'ds-hint' }, 'How DreamScaper tells you about new requests, messages, signatures and payments. Texts to you follow your quiet hours.') : null, h('div', { class: 'ds-tpl-list' }, ...items.map(row)))); };
	draw();

	function edit(t) {
		let last = null;
		const on = h('input', { type: 'checkbox', checked: t.on });
		const chs = new Set(t.channels);
		const chBox = h('div', { class: 'ds-row ds-wrap' }, ...['email', 'sms', 'inapp'].map((c) => h('label', { class: 'ds-check' }, h('input', { type: 'checkbox', checked: chs.has(c), onchange: (e) => { e.target.checked ? chs.add(c) : chs.delete(c); upd(); } }), ' ' + CH[c] + (c === 'sms' && (!r.sms || !r.sms_plan) ? ' (not sending)' : ''))));
		const subj = h('input', { type: 'text', value: t.subject, maxlength: 200 });
		const body = h('textarea', { rows: 9 }, t.email);
		const sms = h('textarea', { rows: 3, maxlength: 640 }, t.sms);
		for (const el of [subj, body, sms]) { el.addEventListener('focus', () => (last = el)); el.addEventListener('input', () => upd()); }
		const prevS = h('b'), prevB = h('div', { class: 'ds-pre' }), prevT = h('div', { class: 'ds-pre' }), smsInfo = h('small', { class: 'ds-hint' }), warn = h('p', { class: 'ds-warn' });
		const upd = () => {
			prevS.innerHTML = ''; put(prevS, render(subj.value, r.sample));
			prevB.innerHTML = ''; put(prevB, render(body.value, r.sample));
			prevT.innerHTML = ''; put(prevT, render(sms.value, r.sample));
			const filled = sms.value.replace(/\{\{?\s*([a-z_]+)\s*(?:\|([^{}]*))?\}?\}/gi, (x, k, f) => r.sample[k.toLowerCase()] || f || '');
			const n = segments(filled + ' Reply STOP to opt out.');
			smsInfo.textContent = `${filled.length} characters with sample details · about ${n} text${n > 1 ? 's' : ''} (the opt-out line is added automatically)`;
			const bad = [...new Set([...unknownTags(subj.value, r.tags), ...unknownTags(body.value, r.tags), ...unknownTags(sms.value, r.tags)])];
			warn.hidden = !bad.length;
			warn.textContent = bad.length ? `⚠️ Not a detail DreamScaper knows: ${bad.map((b2) => '{' + b2 + '}').join(', ')} — it would be left out. Pick from the list below.` : '';
		};
		const timing = t.timingv ? timingBox(t) : t.timing === 'reminders' ? h('p', { class: 'ds-hint' }, '⏰ When reminders go out is set in Settings → Reminders.', h('button', { class: 'ds-link', onclick: () => { m.remove(); M.ctx.openSettings('reminders'); } }, ' Open Reminders')) : null;
		const quiet = t.aud === 'pro' && chs.has('sms') ? quietBox() : null;
		const save = h('button', { class: 'ds-btn' }, 'Save');
		const test = h('button', { class: 'ds-btn ds-ghost' }, '📨 Send me a test');
		const reset = h('button', { class: 'ds-link' }, 'Reset to the original');
		const close = h('button', { class: 'ds-icon-btn ds-modal-x', 'aria-label': 'Close', onclick: () => m.remove() }, icon('close'));
		const m = modal(M.ctx.root, t.label, [
			h('p', { class: 'ds-hint' }, h('b', null, 'When it’s sent: '), t.when, t.thread ? ' It’s also posted in your message thread with the customer, so the conversation has the full history.' : ''),
			h('label', { class: 'ds-check' }, on, t.aud === 'pro' ? ' Send me this alert' : ' Send this message automatically'), h('b', null, 'Send by'), chBox, timing, quiet,
			h('div', { class: 'ds-tpl-ed' },
				h('div', null,
					h('label', { class: 'ds-field' }, h('span', null, 'Email subject'), subj), h('label', { class: 'ds-field' }, h('span', null, 'Email (and in-app) message'), body),
					h('label', { class: 'ds-field' }, h('span', null, 'Text message (short version)'), sms, smsInfo), warn),
				h('div', { class: 'ds-tpl-prev' }, h('small', null, 'Preview with sample details'), h('div', { class: 'ds-tpl-mail' }, prevS, prevB), h('small', null, 'Text'), h('div', { class: 'ds-tpl-sms' }, prevT))),
			tagPicker(r.tags, () => last || body),
			h('div', { class: 'ds-row ds-wrap' }, save, test, h('div', { class: 'ds-spacer' }), reset)], close, 'ds-modal-wide ds-tpl-modal');
		upd();
		save.onclick = async () => {
			save.disabled = true;
			try { const x = await api('crm/templates', { body: { key: t.key, on: on.checked, channels: [...chs], subject: subj.value, email: body.value, sms: sms.value } }); Object.assign(t, x.item); draw(); toast('Saved.'); m.remove(); } catch (e) { if (!planPrompt(e, toast)) toast(e.message); save.disabled = false; }
		};
		test.onclick = async () => {
			test.disabled = true;
			try { const x = await api('crm/templates/test', { body: { key: t.key, subject: subj.value, email: body.value, sms: sms.value, channels: [...chs].filter((c) => c !== 'inapp') } }); toast('Test sent by ' + x.channels.join(' and ') + ' to you.'); } catch (e) { toast(e.message, 5000); }
			test.disabled = false;
		};
		reset.onclick = async () => {
			if (!confirm('Put this message back to the original wording?')) return;
			const x = await api('crm/templates/reset', { method: 'POST', query: { key: t.key } });
			Object.assign(t, x.item); draw(); m.remove(); edit(t);
		};
	}
	function timingBox(t) {
		const labels = { after_days: t.timing === 'review' ? 'Days after the job is marked done' : 'Days after the due date', every_days: 'Then every (days)', max: 'At most (times)' };
		const v = { ...t.timingv };
		const inputs = Object.keys(v).map((k) => h('label', { class: 'ds-field' }, h('span', null, labels[k] || k), h('input', { type: 'number', min: 0, max: 365, value: v[k], class: 'ds-price-in', oninput: (e) => (v[k] = parseInt(e.target.value, 10) || 0) })));
		const b = h('button', { class: 'ds-btn ds-ghost ds-sm' }, 'Save timing');
		b.onclick = async () => { try { await api('crm/templates/timing', { body: { timing: t.timing, values: v } }); t.timingv = v; toast('Timing saved.'); } catch (e) { toast(e.message); } };
		return h('div', { class: 'ds-hub-card ds-timing' }, h('b', null, '⏱️ Timing'), h('div', { class: 'ds-form-grid' }, ...inputs), b);
	}
	function quietBox() {
		const q = { ...(r.quiet || { from: 21, to: 8 }) };
		const hours = Array.from({ length: 24 }, (_, i) => [i, new Date(2000, 0, 1, i).toLocaleTimeString(undefined, { hour: 'numeric' })]);
		const sel = (k) => h('select', { onchange: (e) => (q[k] = +e.target.value) }, ...hours.map(([v, l]) => h('option', { value: v, selected: v === q[k] }, l)));
		const b = h('button', { class: 'ds-btn ds-ghost ds-sm' }, 'Save quiet hours');
		b.onclick = async () => { try { await api('crm/templates', { body: { quiet: q } }); r.quiet = q; toast('Quiet hours saved.'); } catch (e) { toast(e.message); } };
		return h('div', { class: 'ds-hub-card' }, h('b', null, '🌙 Quiet hours for texts to you'), h('div', { class: 'ds-row ds-wrap' }, 'No texts from', sel('from'), 'to', sel('to')), b);
	}
}

/* ------------------------------------------------------- Intake questions */

const TYPES = [['text', 'Short answer'], ['long', 'Long answer'], ['choice', 'Pick one'], ['multi', 'Pick any'], ['yesno', 'Yes / No'], ['number', 'Number'], ['date', 'Date']];

export async function intakeEditor(pane) {
	pane.append(h('span', { class: 'ds-spin' }));
	let r;
	try { r = await api('crm/intake'); await loadCaps(); } catch (e) { pane.innerHTML = ''; pane.append(h('p', { class: 'ds-err' }, e.message)); return; }
	pane.innerHTML = '';
	pane.append(sectionHead('intake'));
	if (!r.allowed) { pane.append(lockNote('intake')); return; }
	const data = {};
	for (const [k, v] of Object.entries(r.intake || {})) data[k] = v.map((x) => ({ ...x, options: (x.options || []).slice() }));
	const services = [...new Set(['*', ...r.services, ...Object.keys(r.defaults), ...Object.keys(data)])];
	let svc = r.services[0] || Object.keys(r.defaults)[0];
	const chips = h('div', { class: 'ds-chips' });
	const box = h('div');
	const drawChips = () => { chips.innerHTML = ''; for (const s of services) chips.append(h('button', { class: 'ds-chip' + (s === svc ? ' on' : ''), onclick: () => { svc = s; drawChips(); draw(); } }, s === '*' ? 'Every request' : s, data[s] && data[s].length ? h('small', { class: 'ds-qs' }, String(data[s].length)) : null)); };
	const draw = () => {
		box.innerHTML = '';
		const list = (data[svc] = data[svc] || []);
		const defaults = r.defaults[svc] || [];
		put(box, defaults.length ? h('details', { class: 'ds-hub-card' }, h('summary', null, `DreamScaper already asks ${defaults.length} question${defaults.length > 1 ? 's' : ''} for ${svc}`), h('ul', { class: 'ds-plain' }, ...defaults.map((d) => h('li', null, d.q, d.options && d.options.length ? h('small', { class: 'ds-muted' }, ' — ' + d.options.join(' / ')) : null)))) : null,
			h('p', { class: 'ds-hint' }, svc === '*' ? 'These are asked on every request you receive, whatever the service.' : `Your own questions, asked whenever a homeowner picks ${svc} and sends the request to you.`),
			...list.map((x, i) => qRow(list, x, i)),
			h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { list.push({ q: '', type: 'choice', options: ['Yes', 'No'], why: '' }); draw(); } }, '+ Add a question'));
	};
	const qRow = (list, x, i) => {
		const q = h('input', { type: 'text', value: x.q, placeholder: 'e.g. Is there a dog in the yard during work hours?', oninput: (e) => (x.q = e.target.value) });
		const type = h('select', { onchange: (e) => { x.type = e.target.value; draw(); } }, ...TYPES.map(([v, l]) => h('option', { value: v, selected: v === x.type }, l)));
		const opts = ['choice', 'multi'].includes(x.type) ? h('input', { type: 'text', value: (x.options || []).join(', '), placeholder: 'Choices, separated by commas', oninput: (e) => (x.options = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) }) : null;
		const why = h('input', { type: 'text', value: x.why || '', placeholder: 'Why you ask (optional — people answer more when they know why)', oninput: (e) => (x.why = e.target.value) });
		return h('div', { class: 'ds-rem' }, h('div', { class: 'ds-row' }, h('b', null, `Q${i + 1}`), q, h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove question', onclick: () => { list.splice(i, 1); draw(); } }, icon('trash', 16))), h('div', { class: 'ds-row ds-wrap' }, type, opts), why);
	};
	const save = h('button', { class: 'ds-btn' }, 'Save my questions');
	save.onclick = async () => { save.disabled = true; try { const x = await api('crm/intake', { body: { intake: data } }); toast(`Saved ${x.count} question${x.count === 1 ? '' : 's'}.`); } catch (e) { if (!planPrompt(e, toast)) toast(e.message); } save.disabled = false; };
	drawChips(); draw();
	put(pane, tip('intake', 'Add the questions you always end up asking on the phone. Homeowners answer them before they send the request — so you can price it the first time.'), chips, box, save);
}

/* -------------------------------------------------- Social links & gallery */

export async function socialEditor(pane) {
	pane.append(h('span', { class: 'ds-spin' }));
	let r;
	try { r = await api('crm/socials'); await loadCaps(); } catch (e) { pane.innerHTML = ''; pane.append(h('p', { class: 'ds-err' }, e.message)); return; }
	pane.innerHTML = '';
	// one row per network, in the order homeowners value them; each has its own "show" switch
	const st = Object.fromEntries(r.networks.map((n) => [n.key, { url: n.url || '', on: n.on !== false }]));
	const errs = {};
	const preview = h('div', { class: 'ds-socials', 'aria-live': 'polite' });
	const drawPreview = () => {
		preview.innerHTML = '';
		const on = r.networks.filter((n) => st[n.key].on && st[n.key].url.trim());
		if (!on.length) { preview.append(h('small', { class: 'ds-muted' }, 'Nothing switched on yet — homeowners won’t see any links.')); return; }
		on.forEach((n, i) => preview.append(h('span', { class: 'ds-soc' + (i < 3 ? '' : ' ds-soc-more') }, h('span', { 'aria-hidden': 'true' }, n.label[0]), h('small', null, n.label))));
		preview.append(h('small', { class: 'ds-muted ds-block' }, on.length > 3 ? `Your Find a Contractor card shows the first 3; your page, proposals and invoices show all ${on.length}.` : 'Shown on your page, your Find a Contractor card, proposals and invoices.'));
	};
	const rows = r.networks.map((n) => {
		const inp = h('input', { type: 'text', value: st[n.key].url, 'aria-label': n.label + ' link', placeholder: n.handle ? '@yourname or paste the link' : 'Paste the full link', oninput: (e) => { st[n.key].url = e.target.value; drawPreview(); } });
		const sw = h('input', { type: 'checkbox', checked: st[n.key].on, 'aria-label': `Show ${n.label} on my pages`, onchange: (e) => { st[n.key].on = e.target.checked; drawPreview(); } });
		const test = h('button', { class: 'ds-btn ds-ghost ds-sm', type: 'button', onclick: () => { const v = st[n.key].url.trim(); if (!v) return toast('Add the link first.'); if (!/^https?:\/\//i.test(v)) return toast('Save first — then Test opens the exact link homeowners will get.'); window.open(v, '_blank', 'noopener'); } }, 'Test');
		errs[n.key] = h('small', { class: 'ds-err' });
		return h('div', { class: 'ds-soc-row' }, h('label', { class: 'ds-field ds-grow' }, h('span', null, n.label), inp, errs[n.key]), h('label', { class: 'ds-check' }, sw, ' Show'), test);
	});
	drawPreview();
	const save = h('button', { class: 'ds-btn' }, 'Save social links');
	save.onclick = async () => {
		for (const k in errs) errs[k].textContent = '';
		save.disabled = true;
		const socials = {}, off = [];
		for (const k in st) { socials[k] = st[k].url; if (!st[k].on) off.push(k); }
		try {
			const x = await api('crm/socials', { body: { socials, off } });
			for (const k in st) st[k].url = (x.socials && x.socials[k]) || '';
			rows.forEach((row, i) => { const k = r.networks[i].key; row.querySelector('input[type=text]').value = st[k].url; });
			drawPreview();
			toast(x.shown ? `Saved — ${x.shown} link${x.shown > 1 ? 's are' : ' is'} on your pages now.` : 'Saved. No links are switched on, so none are shown.', 4000);
		} catch (e) {
			const f = e.data && e.data.data && e.data.data.fields;
			if (f) for (const k in f) if (errs[k]) errs[k].textContent = f[k];
			toast(e.message);
		}
		save.disabled = false;
	};
	const noGbp = !st.google || !st.google.url;
	const gal = h('div', { class: 'ds-gallery-ed' });
	const drawGal = (list) => {
		gal.innerHTML = '';
		for (const g of list) gal.append(h('span', { class: 'ds-ph' }, h('img', { src: g.url, alt: g.caption || '' }), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove photo', onclick: async () => { const x = await api('crm/gallery', { body: { remove: g.url } }); drawGal(x.gallery); } }, icon('close', 12))));
		gal.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: async () => {
			const s = await pickFile();
			if (!s || !s.bitmap) return;
			const c = s.bitmap, k = Math.min(1, 1800 / Math.max(c.width, c.height)), o = document.createElement('canvas');
			o.width = c.width * k; o.height = c.height * k; o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
			try { const x = await api('crm/gallery', { body: { add: o.toDataURL('image/jpeg', 0.85) } }); drawGal(x.gallery); } catch (e) { if (!planPrompt(e, toast)) toast(e.message); }
		} }, icon('upload', 16), ' Add a photo'));
	};
	put(pane, sectionHead('social'),
		noGbp ? tip('social_gbp', 'Start with your Google Business Profile — it’s where most local homeowners check reviews before they call.') : null,
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Social links'), h('p', { class: 'ds-hint' }, 'Paste a link or just your @name. Switch any link off to hide it everywhere at once — it stays saved. Links open in a new tab and carry no trackers. Every plan includes every network.'), ...rows,
			h('h3', null, 'How homeowners will see them'), preview, save),
		h('section', { class: 'ds-hub-card' }, h('h2', null, 'Work gallery'), r.gallery_on ? [h('p', { class: 'ds-hint' }, 'Your best finished work, shown on your contractor page. Up to 60 photos.'), gal] : lockNote('gallery')));
	if (r.gallery_on) drawGal(r.gallery);
}

/* ----------------------------------------------------------- Quick replies */

export async function snippetsEditor(pane, me, saveSettings) {
	await loadCaps();
	const list = ((me.settings && me.settings.snippets) || []).slice();
	const box = h('div');
	const draw = () => {
		box.innerHTML = '';
		list.forEach((s, i) => box.append(h('div', { class: 'ds-row' }, h('textarea', { rows: 2, oninput: (e) => (list[i] = e.target.value) }, s), h('button', { class: 'ds-icon-btn', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); draw(); } }, icon('trash', 16)))));
		box.append(h('button', { class: 'ds-btn ds-ghost ds-sm', onclick: () => { list.push(''); draw(); } }, '+ Add a quick reply'));
	};
	if (!list.length) list.push('Hi {customer_first_name}, thanks for the details! I can come out to look at the property on [day] between [time] — does that work for you?', 'Thanks {customer_first_name}! I’ll have your quote ready within two business days.');
	draw();
	const save = h('button', { class: 'ds-btn' }, 'Save quick replies');
	save.onclick = () => saveSettings(save, { snippets: list.filter((s) => s.trim()) });
	put(pane, sectionHead('snippets'), has('snippets') ? null : lockNote('snippets'), usageBar('snippets'), h('p', { class: 'ds-hint' }, 'In any conversation, tap ⚡ to drop one in. {customer_first_name} fills in automatically.'), box, save);
}
