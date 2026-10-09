import { chromium } from 'playwright-core';
import fs from 'fs';
const cfg = fs.readFileSync('/data/repo/js/config.js', 'utf8');
const KEY = cfg.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+/)[0];
const URL = 'https://dgfsxsargqypvwiifyrp.supabase.co';
const PW = fs.readFileSync('/data/.testpw', 'utf8').trim();
export async function token(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const j = await r.json(); if (!j.access_token) throw new Error('login failed ' + r.status);
  return j;
}
export async function launch() { return chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] }); }
export async function page(b, email, w = 1440, h = 900, errs = []) {
  const s = await token(email);
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('vp-theme', localStorage.getItem('vp-theme') || ''); }, ['sb-dgfsxsargqypvwiifyrp-auth-token', JSON.stringify(s)]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(`${email.split('@')[0]}@${w}: ${m.text().slice(0, 200)}`); });
  p.on('pageerror', e => errs.push(`${email}@${w} PAGE: ${e.message}`));
  await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  return p;
}
export const ADMIN = 'agent-admin@vadimopedia.test', USER = 'agent-user@vadimopedia.test';
export async function go(p, section) { await p.click(`.nav-link[data-section="${section}"]`); await p.waitForTimeout(3000); }
export async function hscroll(p) { return p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); }
