let state = {
  isScanning: false,
  results: [],
  currentIndex: 0,
  targetUrls: [],
  logs: []
};

let auditWindowId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getState') {
    sendResponse(state);
  } else if (msg.action === 'start') {
    state.targetUrls = msg.urls;
    state.isScanning = true;
    state.results = [];
    state.currentIndex = 0;
    state.logs = [];
    saveState();
    startAudit();
    sendResponse(true);
  } else if (msg.action === 'pause') {
    state.isScanning = false;
    saveState();
    sendResponse(true);
  } else if (msg.action === 'clear') {
    state = { isScanning: false, results: [], currentIndex: 0, targetUrls: [], logs: [] };
    saveState();
    sendResponse(true);
  }
  return true;
});

function saveState() {
  chrome.storage.local.set({ extensionState: state });
}

chrome.storage.local.get(['extensionState'], (res) => {
  if (res.extensionState) state = res.extensionState;
});

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function calculateConfidence(data) {
  let score = 0;
  
  if (data.emails && data.emails.length > 0) {
    let bestEmail = data.emails[0];
    let type = 'General';
    let highestPriority = 0;

    data.emails.forEach(e => {
      const em = e.toLowerCase();
      let priority = 1;
      if (em.includes('founder') || em.includes('ceo') || em.includes('owner') || em.includes('president')) { priority = 10; type = 'Decision Maker'; }
      else if (em.includes('sales') || em.includes('partner') || em.includes('contact')) { priority = 5; type = 'Sales/Partnership'; }
      else if (em.includes('support') || em.includes('info') || em.includes('admin')) { priority = 3; type = 'General'; }

      if (priority > highestPriority) {
        highestPriority = priority;
        bestEmail = e;
        data.emailType = type;
      }
    });

    data.bestEmail = bestEmail;
    score += (highestPriority * 5); // up to 50
  }

  if (data.phone) score += 20;
  if (data.bestLinkedIn) score += 20;
  if (data.social && data.social.facebook) score += 10;
  
  if (score > 100) score = 100;
  if (score === 0 && data.technicalReason === '') score = 10;
  
  data.confidenceScore = score;
}

async function safeCreateTab(url) {
  if (!auditWindowId) {
    const win = await chrome.windows.create({
      url: 'about:blank',
      type: 'popup',
      width: 1200,
      height: 900,
      left: 0,
      top: 0,
      state: 'normal',
      focused: false
    });
    auditWindowId = win.id;
  }
  return await chrome.tabs.create({ windowId: auditWindowId, url, active: true });
}

async function startAudit() {
  while (state.isScanning && state.currentIndex < state.targetUrls.length) {
    const targetUrl = state.targetUrls[state.currentIndex];
    
    let finalData = {
      url: targetUrl, name: new URL(targetUrl).hostname.replace('www.',''), 
      emails: [], bestEmail: '', emailType: '', phone: '',
      linkedinLinks: [], bestLinkedIn: '', social: {},
      technicalReason: '', screenshots: []
    };

    chrome.runtime.sendMessage({ action: 'updateUI', state, currentTaskUrl: targetUrl }).catch(() => {});

    let scoutTabId = null;
    try {
      const tab = await safeCreateTab(targetUrl);
      scoutTabId = tab.id;
      
      await sleep(5000); // Wait for load
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: scoutTabId },
        func: extractPageData
      });

      if (!results || !results[0] || !results[0].result) {
        finalData.technicalReason = 'ACCESS_DENIED';
      } else {
        const cData = results[0].result;
        if (cData.blocked) {
          finalData.technicalReason = 'CAPTCHA_BLOCKED';
        } else {
          mergeData(finalData, cData);
          await sleep(500);
          
          // Screenshot
          if (finalData.emails.length > 0 || finalData.phone) {
            await chrome.windows.update(auditWindowId, { focused: true }).catch(()=>{});
            await sleep(500);
            try {
              const img = await chrome.tabs.captureVisibleTab(auditWindowId, { format: 'jpeg', quality: 80 });
              if (img) finalData.screenshots.push(img);
            } catch(e) {}
            await chrome.windows.update(auditWindowId, { focused: false }).catch(()=>{});
          }
        }
      }

      calculateConfidence(finalData);

    } catch (error) {
      finalData.technicalReason = 'JS_RENDER_FAILED';
    }

    if (scoutTabId) await chrome.tabs.remove(scoutTabId).catch(()=>{});

    state.results.push(finalData);
    state.currentIndex++;
    saveState();
    
    chrome.runtime.sendMessage({ action: 'updateUI', state }).catch(() => {});
    await sleep(2000);
  }

  if (auditWindowId) {
    chrome.windows.remove(auditWindowId).catch(()=>{});
    auditWindowId = null;
  }
}

function mergeData(final, newData) {
  newData.emails.forEach(e => { if(!final.emails.includes(e)) final.emails.push(e); });
  if (newData.phone && !final.phone) final.phone = newData.phone;
  newData.linkedinLinks.forEach(l => { if(!final.linkedinLinks.includes(l)) final.linkedinLinks.push(l); });
  if (final.linkedinLinks.length > 0) final.bestLinkedIn = final.linkedinLinks[0];
}

// ---- INJECTED SCRIPT ----
function extractPageData() {
  const text = document.body.innerText || "";
  const html = document.body.innerHTML || "";
  
  if (text.includes("Cloudflare") && text.includes("Checking your browser")) return { blocked: true };
  if (text.includes("Please verify you are a human")) return { blocked: true };

  const emails = [];
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  (text.match(emailRegex) || []).forEach(e => { if(e.includes('.')) emails.push(e.toLowerCase()) });
  (html.match(/mailto:([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi) || []).forEach(m => {
    emails.push(m.replace('mailto:','').toLowerCase());
  });

  let phone = "";
  const pMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
  if (pMatch) phone = pMatch[0];

  const linkedinLinks = [];
  document.querySelectorAll('a[href*="linkedin.com/company"]').forEach(a => linkedinLinks.push(a.href));

  return {
    blocked: false,
    emails: [...new Set(emails)],
    phone,
    linkedinLinks: [...new Set(linkedinLinks)]
  };
}
