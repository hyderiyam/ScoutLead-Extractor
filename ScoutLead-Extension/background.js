// ═══════════════════════════════════════════════════════════
//  background.js — TURBO FORENSICS (Off-Screen HD Capture)
// ═══════════════════════════════════════════════════════════

let state = {
  isRunning: false,
  urls: [],
  currentIndex: 0,
  results: [],
  logs: [],
  concurrency: 3,
  delay: 2
};

let auditWindowId = null;
let isPhotographerBusy = false;

chrome.storage.local.get(['savedState'], (data) => {
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
    return;
  }
  if (data && data.savedState) {
    Object.assign(state, data.savedState);
    state.isRunning = false;
  }
});

function saveState() {
  chrome.storage.local.set({ savedState: state });
}

function addLog(url, message, type = 'info') {
  const urlSafe = url ? String(url).substring(0, 30) : 'System';
  const logEntry = { time: new Date().toLocaleTimeString(), url: urlSafe, message, type };
  state.logs.unshift(logEntry);
  if (state.logs.length > 50) state.logs.pop();
  saveState();
  chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startExtraction') {
    if (state.urls.length === 0 || msg.urls[0] !== state.urls[0]) {
      state.urls = msg.urls;
      state.currentIndex = 0;
      state.results = [];
      state.logs = [];
    }
    state.isRunning = true;
    state.concurrency = msg.concurrency || 3;
    saveState();
    initializeAuditWindow().then(() => {
      for (let i = 0; i < state.concurrency; i++) {
        processTurboQueue();
      }
    });
    sendResponse({ status: 'started' });
  }
  else if (msg.action === 'stopExtraction') {
    state.isRunning = false;
    saveState();
    sendResponse({ status: 'stopped' });
  }
  else if (msg.action === 'clearState') {
    state = { isRunning: false, urls: [], currentIndex: 0, results: [], logs: [], concurrency: 3, delay: 2 };
    saveState();
    if (auditWindowId) chrome.windows.remove(auditWindowId).catch(() => { });
    auditWindowId = null;
    sendResponse({ status: 'cleared' });
  }
  else if (msg.action === 'getState') {
    sendResponse(state);
  }
  else if (msg.action === 'startOutreachCampaign') {
    processOutreachCampaign(msg.leads, msg.template, msg.subject, msg.channel);
    sendResponse({ status: 'started' });
  }
});

// ── Outreach Campaign Logic ──────────────────────────────

async function processOutreachCampaign(leads, template, subject, channel) {
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const pct = Math.round(((i + 1) / leads.length) * 100);

    const msg = template
      .replace(/{{name}}/g, lead.name)
      .replace(/{{company}}/g, lead.company)
      .replace(/{{email}}/g, lead.email);

    const sub = subject
      .replace(/{{company}}/g, lead.company)
      .replace(/{{name}}/g, lead.name);

    try {
      if (channel === 'gmail') {
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(sub)}&body=${encodeURIComponent(msg)}`;
        await safeCreateTab({ url: gmailUrl, active: false });
      } else if (channel === 'linkedin' && lead.linkedin) {
        let liUrl = lead.linkedin;
        if (liUrl && !liUrl.startsWith('http')) liUrl = 'https://' + liUrl;
        await safeCreateTab({ url: liUrl, active: false });
      } else if (channel === 'whatsapp' && lead.phone) {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
        await safeCreateTab({ url: waUrl, active: false });
      }
    } catch (e) {
      console.error('Turbo Outreach Tab Error:', e);
    }

    chrome.runtime.sendMessage({ action: 'outreachProgress', percent: pct }).catch(() => { });
    await sleep(2500);
  }
}

// ── Utility & Helper Functions ───────────────────────────

async function safeCreateTab(createProperties) {
  try {
    return await chrome.tabs.create(createProperties);
  } catch (e) {
    if (e.message.includes('Tabs cannot be edited')) {
      await sleep(1500);
      return await chrome.tabs.create(createProperties);
    }
    throw e;
  }
}

async function initializeAuditWindow() {
  try {
    if (auditWindowId) {
      try { await chrome.windows.get(auditWindowId); return; } catch (e) { auditWindowId = null; }
    }
    const win = await chrome.windows.create({
      url: 'about:blank',
      type: 'normal',
      width: 1200,
      height: 900,
      left: 0,
      top: 0,
      state: 'normal',
      focused: false
    });
    auditWindowId = win.id;
  } catch (e) { console.error('Win Init Error', e); }
}

async function processTurboQueue() {
  if (!state.isRunning || state.currentIndex >= state.urls.length) {
    if (state.currentIndex >= state.urls.length && state.isRunning) {
      state.isRunning = false;
      addLog('System', 'Audit Engine Finished!', 'success');
      if (auditWindowId) chrome.windows.remove(auditWindowId).catch(() => { });
      auditWindowId = null;
      saveState();
    }
    return;
  }

  const myIndex = state.currentIndex++;
  const rawUrl = state.urls[myIndex];
  if (!rawUrl) return processTurboQueue();

  let name = '', url = rawUrl;
  const separators = ['→', '->', '=>'];
  for (const sep of separators) {
    if (rawUrl.includes(sep)) {
      const parts = rawUrl.split(sep);
      name = parts[0].trim();
      url = parts.slice(1).join(sep).trim();
      break;
    }
  }

  try {
    await turboForensics(url, name);
  } catch (err) {
    addLog(url, 'Row Skipped', 'error');
  }

  if (state.isRunning) {
    processTurboQueue();
  }
}

async function turboForensics(url, companyName) {
  if (!url || typeof url !== 'string' || url.trim() === '') return;

  let finalData = {
    email: '', emails: [], bestEmail: '', emailType: '',
    phone: '', phones: [], address: '', name: companyName || '', website: url, url: url,
    reason: '', technicalReason: '', confidenceScore: 0,
    screenshots: [], isWhatsApp: false, deliverability: 'N/A',
    linkedinLinks: [], bestLinkedIn: '',
    social: { facebook: '', instagram: '', twitter: '', youtube: '', tiktok: '', pinterest: '' }
  };

  let targetUrl = url.includes('http') ? url.substring(url.indexOf('http')).trim() : 'https://' + url;
  let scoutTabId = null;

  try {
    addLog(url, '[Scout] Deep scanning...');

    // ── Push to results IMMEDIATELY so card shows in UI right away ──
    state.results.push(finalData);
    saveState();
    chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });

    const scoutTab = await safeCreateTab({ url: targetUrl, active: false });
    scoutTabId = scoutTab.id;

    await waitForTabComplete(scoutTabId, 15000); await sleep(3000);

    // ── Scroll to trigger lazy-loaded JS content ──
    await chrome.scripting.executeScript({
      target: { tabId: scoutTabId },
      func: () => {
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => window.scrollTo(0, 0), 800);
      }
    }).catch(() => { });
    await sleep(1500);

    // ── Login Wall Detection ──
    const loginCheck = await chrome.scripting.executeScript({
      target: { tabId: scoutTabId },
      func: () => {
        const txt = (document.body?.innerText || '').toLowerCase();
        return txt.includes('sign in to view') || txt.includes('login to see') ||
          txt.includes('members only') || txt.includes('create an account to') ||
          (!!document.querySelector('input[type="password"]') && txt.includes('login'));
      }
    }).catch(() => [{ result: false }]);
    if (loginCheck?.[0]?.result) {
      finalData.technicalReason = 'ACCESS_DENIED';
      addLog(url, '[Scout] ⚠️ Login wall detected — only public content scraped', 'error');
    }

    const homeRes = await chrome.scripting.executeScript({ target: { tabId: scoutTabId }, func: scrapeFullPage });
    const hData = homeRes?.[0]?.result;

    if (hData) {
      const newItems = getNewDataItems(finalData, hData);
      if (newItems.length > 0) {
        addLog(url, '[Photo] Snapping Proof...');
        await captureWithPhotographer(scoutTabId, targetUrl, "Homepage Discovery", newItems, finalData);
      }
      mergeData(finalData, hData);

      // ── Update UI after homepage scan so data appears immediately ──
      saveState();
      chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });

      // Also scan Contact page for hidden emails
      if (finalData.contactLink && finalData.contactLink !== targetUrl) {
        addLog(url, '[Scout] Checking Contact page...');
        await chrome.tabs.update(scoutTabId, { url: finalData.contactLink });
        await waitForTabComplete(scoutTabId, 10000); await sleep(2000);
        const cRes = await chrome.scripting.executeScript({ target: { tabId: scoutTabId }, func: scrapeFullPage });
        const cData = cRes?.[0]?.result;
        if (cData) {
          const cNew = getNewDataItems(finalData, cData);
          if (cNew.length > 0) {
            addLog(url, '[Photo] Snapping Contact Proof...');
            await captureWithPhotographer(scoutTabId, finalData.contactLink, "Contact Page Proof", cNew, finalData);
          }
          mergeData(finalData, cData);
          saveState();
          chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });
        }
      }

      if (finalData.teamLink) {
        addLog(url, '[Scout] Checking Team/LinkedIn...');
        await chrome.tabs.update(scoutTabId, { url: finalData.teamLink });
        await waitForTabComplete(scoutTabId, 10000); await sleep(3000);
        const teamRes = await chrome.scripting.executeScript({ target: { tabId: scoutTabId }, func: scrapeFullPage });
        const tData = teamRes?.[0]?.result;
        if (tData) {
          const tNew = getNewDataItems(finalData, tData);
          if (tNew.length > 0) await captureWithPhotographer(scoutTabId, finalData.teamLink, "Leadership Proof", tNew, finalData);
          mergeData(finalData, tData);
          saveState();
          chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });
        }
      }
    }

    if (finalData.name) {
      const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(finalData.name.split('|')[0].trim())}`;
      addLog(url, '[Scout] Checking Maps...');
      await chrome.tabs.update(scoutTabId, { url: mapsUrl });
      await waitForTabComplete(scoutTabId, 15000); await sleep(4000);
      const mapsRes = await chrome.scripting.executeScript({ target: { tabId: scoutTabId }, func: scrapeMapsData });
      const mData = mapsRes?.[0]?.result;
      if (mData) {
        const mNew = getNewDataItems(finalData, mData);
        if (mNew.length > 0) await captureWithPhotographer(scoutTabId, mapsUrl, "Google Maps Proof", mNew, finalData);
        mergeData(finalData, mData);
      }
    }

    if (finalData.email) finalData.deliverability = await checkEmailDeliverability(finalData.email);
    if (!finalData.isWhatsApp && finalData.phone) finalData.isWhatsApp = await verifyWhatsAppDeeply(finalData.phone);

    calculateConfidenceAndBestMatches(finalData);

    if (finalData.emails.length === 0 && finalData.phone === '' && finalData.linkedinLinks.length === 0) {
      if (!finalData.technicalReason) finalData.technicalReason = 'NO_PUBLIC_CONTACT_DATA';
    } else if (finalData.emails.length === 0 && finalData.phone === '' && finalData.linkedinLinks.length > 0) {
      if (!finalData.technicalReason) finalData.technicalReason = 'SOCIAL_ONLY';
    }

    saveState();

  } catch (e) {
    finalData.technicalReason = 'TIMEOUT_OR_CRASH';
    addLog(url, 'Row Failed: ' + e.message, 'error');
  } finally {
    if (scoutTabId) try { await chrome.tabs.remove(scoutTabId); } catch (e) { }
    chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => { });
  }
}

async function captureWithPhotographer(tabId, targetUrl, label, items, finalData) {
  if (!tabId || !targetUrl || !targetUrl.startsWith('http')) return;

  if (!auditWindowId) {
    await initializeAuditWindow();
    if (!auditWindowId) return;
  }

  while (isPhotographerBusy) { await sleep(1000); }
  isPhotographerBusy = true;

  try {
    await chrome.windows.update(auditWindowId, { focused: true, state: 'normal' }).catch(() => { });
    await chrome.tabs.update(tabId, { active: true }).catch(() => { });

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: highlightOrangeData,
      args: [items]
    }).catch(() => { });

    await sleep(1500);

    const img = await chrome.tabs.captureVisibleTab(auditWindowId, { format: 'jpeg', quality: 90 }).catch(() => null);
    
    if (img && img.length > 1000) {
      finalData.screenshots.push({ label, img });
      addLog(targetUrl, '[Photo] ✅ Proof captured!', 'success');
    } else {
      addLog(targetUrl, '[Photo] Screenshot was blank — skipped', 'error');
    }
  } catch (e) {
    addLog(targetUrl, '[Photo] Skipped: ' + (e.message || 'unknown error'), 'error');
  } finally {
    isPhotographerBusy = false;
  }
}


function scrapeFullPage() {
  try {
    const res = {
      emails: [], email: '', phone: '', phones: [], address: '', linkedinLinks: [],
      teamLink: '', contactLink: '',
      social: { facebook: '', instagram: '', twitter: '', youtube: '', tiktok: '', pinterest: '' }
    };
    const text = document.body?.innerText || '';
    const html = document.documentElement?.innerHTML || '';
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    // ── METHOD 1: Full HTML regex scan ──
    const m1 = html.match(emailRegex) || [];

    // ── METHOD 2: All mailto: href links ──
    const m2 = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
      .map(a => a.href.replace('mailto:', '').split('?')[0].trim());

    // ── METHOD 3: data-email / data-cfemail attributes (Cloudflare obfuscation) ──
    const m3 = [];
    document.querySelectorAll('[data-email],[data-mail],[data-contact-email]').forEach(el => {
      const v = el.getAttribute('data-email') || el.getAttribute('data-mail') || el.getAttribute('data-contact-email') || '';
      if (v && v.includes('@')) m3.push(v.trim());
    });
    // Cloudflare cfemail decode
    document.querySelectorAll('[data-cfemail]').forEach(el => {
      try {
        const enc = el.getAttribute('data-cfemail');
        let dec = '', r = parseInt(enc.substr(0, 2), 16);
        for (let i = 2; i < enc.length; i += 2) dec += String.fromCharCode(parseInt(enc.substr(i, 2), 16) ^ r);
        if (dec.includes('@')) m3.push(dec);
      } catch (e) { }
    });

    // ── METHOD 4: HTML entity decoding (&#64; and %40 = @) ──
    const decoded = html.replace(/&#64;|&#x40;|%40|\[at\]|\(at\)/gi, '@').replace(/\[dot\]|\(dot\)/gi, '.');
    const m4 = decoded.match(emailRegex) || [];

    // ── METHOD 5: JSON-LD / Schema.org structured data ──
    const m5 = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.innerText);
        const str = JSON.stringify(data);
        (str.match(emailRegex) || []).forEach(e => m5.push(e));
        // Also extract phone + address from schema
        if (data.telephone && !res.phone) res.phone = String(data.telephone);
        const addr = data.address || (data[0] && data[0].address);
        if (addr && !res.address) {
          if (typeof addr === 'string') res.address = addr;
          else res.address = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
            .filter(Boolean).join(', ');
        }
      } catch (e) { }
    });

    // ── METHOD 6: Footer deep scan (most contact info lives here) ──
    const m6 = [];
    const footer = document.querySelector('footer, [class*="footer"], [id*="footer"], [class*="contact"], [id*="contact"]');
    if (footer) (footer.innerHTML.match(emailRegex) || []).forEach(e => m6.push(e));

    // ── METHOD 7: Image alt / title / aria-label scan (catches image-based emails) ──
    const m7 = [];
    document.querySelectorAll('img').forEach(img => {
      const txt = [img.alt, img.title, img.getAttribute('aria-label'), img.getAttribute('data-src')].filter(Boolean).join(' ');
      (txt.match(emailRegex) || []).forEach(e => m7.push(e));
    });
    // Also check figcaptions and visible label text near images
    document.querySelectorAll('figcaption, [class*="caption"], [class*="contact-img"] + *, [class*="email-img"] + *').forEach(el => {
      ((el.innerText || '').match(emailRegex) || []).forEach(e => m7.push(e));
    });

    // ── Merge, deduplicate, filter junk ──
    const allRaw = [...new Set([...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7])];
    const allEmails = allRaw
      .filter(e => e.includes('@') && e.split('@')[1]?.includes('.'))
      .filter(e => !e.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff|ttf|eot|otf|map)$/i))
      .filter(e => !/(example\.com|domain\.com|yourmail|test@test|sentry\.io|noreply|no-reply|donotreply|wordpress\.com|wixpress|squarespace|@2x\.|schema\.org)/i.test(e));
    res.emails = allEmails;
    if (allEmails.length > 0) res.email = allEmails[0];

    // ── Phone: multi-pattern (Collect all) ──
    const allPhones = [];
    const phonePatterns = [
      /(?:\+92|0)[\s\-]?\d{3}[\s\-]?\d{7}/g,                              // Pakistan mobile
      /(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})/g, // US/Canada
      /(?:\+|00)\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g // International fallback
    ];
    for (const pat of phonePatterns) {
      const matches = text.match(pat);
      if (matches) matches.forEach(m => allPhones.push(m.trim()));
    }
    // Deduplicate
    const uniquePhonesMap = {};
    allPhones.forEach(p => {
       const clean = p.replace(/\D/g, '');
       if (clean.length >= 8 && !uniquePhonesMap[clean]) uniquePhonesMap[clean] = p;
    });
    res.phones = Object.values(uniquePhonesMap);
    if (res.phones.length > 0) res.phone = res.phones[0];

    // ── Address: schema tag or address element ──
    if (!res.address) {
      const addrEl = document.querySelector('address, [class*="address"], [id*="address"], [itemtype*="PostalAddress"]');
      if (addrEl) res.address = addrEl.innerText.replace(/\s+/g, ' ').trim().slice(0, 250);
    }

    // ── All Social + Navigation links ──
    Array.from(document.querySelectorAll('a[href]')).forEach(a => {
      const h = (a.href || '').toLowerCase().trim();
      const txt = (a.innerText || '').toLowerCase().trim();
      if (!h || h.startsWith('javascript') || h === '#') return;

      if (h.includes('linkedin.com/') && !h.includes('/share') && !h.includes('/jobs') && !h.includes('/post') && !h.includes('/feed') && !h.includes('linkedin.com/company/linkedin')) res.linkedinLinks.push(a.href);
      if (h.includes('facebook.com/') && !h.includes('sharer') && !h.includes('login') && !h.includes('/tr?')) res.social.facebook = res.social.facebook || a.href;
      if (h.includes('instagram.com/') && !h.includes('login')) res.social.instagram = res.social.instagram || a.href;
      if ((h.includes('twitter.com/') || h.includes('x.com/')) && !h.includes('intent/') && !h.includes('login')) res.social.twitter = res.social.twitter || a.href;
      if (h.includes('youtube.com/') && (h.includes('/channel/') || h.includes('/user/') || h.includes('/@') || h.includes('/c/'))) res.social.youtube = res.social.youtube || a.href;
      if (h.includes('tiktok.com/@')) res.social.tiktok = res.social.tiktok || a.href;
      if (h.includes('pinterest.com/') && !h.includes('/pin/')) res.social.pinterest = res.social.pinterest || a.href;

      if (!res.teamLink && /\b(team|about|staff|leadership|people|founders?)\b/i.test(txt)) res.teamLink = a.href;
      if (!res.contactLink && /\b(contact|reach us|get in touch|support|help)\b/i.test(txt)) res.contactLink = a.href;
    });

    res.linkedinLinks = [...new Set(res.linkedinLinks)];
    return res;
  } catch (e) { return {}; }
}


function highlightOrangeData(values) {
  if (!values || values.length === 0) return;
  const targets = [];
  const lowerValues = values.map(v => v ? String(v).toLowerCase().trim() : '');

  // Search links and text
  Array.from(document.querySelectorAll('a, span, p, div, h1, h2, h3, h4, h5, h6, li, td, th')).forEach(el => {
    if (el.children.length > 2) return; 
    
    const txt = el.innerText ? el.innerText.toLowerCase() : '';
    const href = (el.tagName === 'A') ? el.href.toLowerCase() : '';

    lowerValues.forEach(val => {
      if (val && val.length > 2) {
        if (txt.includes(val) || (href && href.includes(val))) {
          targets.push(el);
        }
      }
    });
  });

  // Filter targets to only keep the deepest elements (avoid highlighting giant parent divs)
  const finalTargets = targets.filter(el => {
    for (const child of targets) {
      if (child !== el && el.contains(child)) return false;
    }
    return true;
  });

  // Apply Professional Forensic Styling
  finalTargets.forEach((el, idx) => {
    if (!el) return;
    el.style.outline = '6px solid #e11d48'; // Bright Red
    el.style.outlineOffset = '4px';
    el.style.borderRadius = '4px';
    el.style.position = 'relative';
    el.style.zIndex = '2147483647';
    el.style.backgroundColor = 'rgba(225, 29, 72, 0.2)';

    // Add Forensic Tag
    const tag = document.createElement('div');
    tag.innerText = '🎯 DATA FOUND';
    tag.style.cssText = `
      position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
      background: #e11d48; color: #fff;
      padding: 6px 12px; font-size: 14px; font-weight: 900;
      border-radius: 6px; white-space: nowrap;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      z-index: 2147483647; text-transform: uppercase;
      font-family: system-ui, sans-serif; letter-spacing: 1px;
    `;
    
    // Create an arrow pointing down
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid #e11d48;
    `;
    tag.appendChild(arrow);
    el.appendChild(tag);

    // Scroll to the first match instantly
    if (idx === 0) {
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  });
}

function getNewDataItems(current, source) {
  const news = [];
  if (source.email && source.email !== current.email) news.push(source.email);
  
  if (source.phones && source.phones.length > 0) {
    source.phones.forEach(p => {
      if (!(current.phones || []).includes(p)) news.push(p);
    });
  } else if (source.phone && source.phone !== current.phone) {
    news.push(source.phone);
  }

  if (source.address && source.address !== current.address) news.push(source.address);
  
  if (source.linkedinLinks) {
    source.linkedinLinks.forEach(l => {
      let isNew = true;
      (current.linkedinLinks || []).forEach(cl => { if (cl.includes(l) || l.includes(cl)) isNew = false; });
      if (isNew) news.push(l);
    });
  }

  if (source.social) {
    for (const key of ['facebook', 'instagram', 'twitter', 'youtube', 'tiktok', 'pinterest']) {
      if (source.social[key] && (!current.social || source.social[key] !== current.social[key])) {
        news.push(source.social[key]);
      }
    }
  }
  
  return news;
}

function mergeData(target, source) {
  if (!source) return;
  if (!target.email && source.email) target.email = source.email;
  if (source.phones && source.phones.length > 0) {
    target.phones = [...new Set([...(target.phones || []), ...source.phones])];
    if (!target.phone && target.phones.length > 0) target.phone = target.phones[0];
  } else if (!target.phone && source.phone) {
    target.phone = source.phone;
    if (!target.phones) target.phones = [];
    target.phones.push(source.phone);
  }
  if (!target.address && source.address) target.address = source.address;
  // Merge all emails array
  if (source.emails && source.emails.length > 0) {
    target.emails = [...new Set([...(target.emails || []), ...source.emails])];
    if (!target.email && target.emails.length > 0) target.email = target.emails[0];
  }
  if (source.linkedinLinks && source.linkedinLinks.length > 0) {
    target.linkedinLinks = [...new Set([...(target.linkedinLinks || []), ...source.linkedinLinks])];
  }
  if (source.teamLink && !target.teamLink) target.teamLink = source.teamLink;
  if (source.contactLink && !target.contactLink) target.contactLink = source.contactLink;
  // Merge all social platforms
  if (source.social) {
    if (!target.social) target.social = {};
    for (const key of ['facebook', 'instagram', 'twitter', 'youtube', 'tiktok', 'pinterest']) {
      if (!target.social[key] && source.social[key]) target.social[key] = source.social[key];
    }
  }
}

// NOTE: scrapeFullPage is defined above (line ~295) with full email+mailto detection.
// The old duplicate has been removed to prevent it from overriding the advanced version.

function scrapeMapsData() {
  try {
    const res = { phone: '', address: '' };
    const pEl = document.querySelector('[data-item-id^="phone:tel:"]');
    if (pEl) res.phone = pEl.innerText.trim();
    const aEl = document.querySelector('[data-item-id="address"]');
    if (aEl) res.address = aEl.innerText.trim();
    return res;
  } catch (e) { return {}; }
}

async function checkEmailDeliverability(email) {
  try {
    const domain = email.split('@')[1];
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`);
    const json = await response.json();
    return (json.Answer && json.Answer.length > 0) ? "Deliverable" : "Undeliverable";
  } catch (e) { return "Unknown"; }
}

async function verifyWhatsAppDeeply(phoneNumber) {
  let cleanNum = phoneNumber.replace(/\D/g, '');
  if (cleanNum.length < 10) return false;
  let tabId = null;
  try {
    const tab = await safeCreateTab({ url: `https://api.whatsapp.com/send?phone=${cleanNum}`, active: false });
    tabId = tab.id;
    await waitForTabComplete(tabId, 10000); await sleep(2000);
    const res = await chrome.scripting.executeScript({
      target: { tabId }, func: () => {
        return document.querySelector('#action-button, a[href*="whatsapp.com/send"]') !== null;
      }
    });
    return res?.[0]?.result === true;
  } catch (e) { return false; }
  finally { if (tabId) try { await chrome.tabs.remove(tabId); } catch (e) { } }
}

function waitForTabComplete(tabId, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { resolve('timeout'); }, timeout);
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve('complete');
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function calculateConfidenceAndBestMatches(data) {
  let score = 0;

  // Rule 1: Choose Best Email
  if (data.emails && data.emails.length > 0) {
    let bestEmail = data.emails[0];
    let emailType = 'General';
    let highestPriority = 0;

    data.emails.forEach(e => {
      const em = e.toLowerCase();
      let priority = 1;
      let type = 'General';

      if (em.includes('founder') || em.includes('ceo') || em.includes('owner') || em.includes('president')) { priority = 10; type = 'Decision Maker'; }
      else if (em.includes('sales') || em.includes('partner') || em.includes('hello') || em.includes('contact')) { priority = 5; type = 'Sales/Partnership'; }
      else if (em.includes('support') || em.includes('info') || em.includes('admin')) { priority = 3; type = 'General'; }
      else if (!em.includes('info') && !em.includes('support') && !em.includes('contact')) { priority = 4; type = 'Personal/Direct'; } // Likely a direct person's name

      if (priority > highestPriority) {
        highestPriority = priority;
        bestEmail = e;
        emailType = type;
      }
    });

    data.bestEmail = bestEmail;
    data.emailType = emailType;
    score += (highestPriority * 5); // max 50 points for a good email
  }

  // Rule 2: Choose Best LinkedIn
  if (data.linkedinLinks && data.linkedinLinks.length > 0) {
    let bestLi = data.linkedinLinks[0];
    data.linkedinLinks.forEach(l => {
      if (l.includes('company/')) bestLi = l; // Prefer company page over random employee for the top level
    });
    data.bestLinkedIn = bestLi;
    score += 20; // 20 points for having LinkedIn
  }

  // Rule 3: Phone & WhatsApp
  if (data.phone) score += 15;
  if (data.isWhatsApp) score += 15;

  // Final adjustments
  if (data.deliverability === 'Deliverable') score += 10;

  if (score > 100) score = 100;
  if (score === 0 && data.technicalReason === '') score = 10; // Found nothing but site loaded

  data.confidenceScore = score;
}
