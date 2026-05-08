// ═══════════════════════════════════════════════════════════
//  popup.js — Master Audit (WhatsApp Columns & All Rows)
// ═══════════════════════════════════════════════════════════

let parsedUrls = [];

// ── DOM refs ──────────────────────────────────────────────
const startBtn       = document.getElementById('startBtn');
const stopBtn        = document.getElementById('stopBtn');
const exportBtn      = document.getElementById('exportBtn');
const exportVisualBtn = document.getElementById('exportVisualBtn');
const clearBtn       = document.getElementById('clearBtn');
const progressBar    = document.getElementById('progressBar');
const progressPct    = document.getElementById('progressPct');
const progressText   = document.getElementById('progressText');
const logsContainer  = document.getElementById('logsContainer');
const historyList    = document.getElementById('historyList');
const statLeads      = document.getElementById('statLeads');
const statEmails     = document.getElementById('statEmails');
const statWhatsApp   = document.getElementById('statWhatsApp');
const statusText     = document.getElementById('statusText');
const csvFile        = document.getElementById('csvFile');
const fileDrop       = document.getElementById('fileDrop');
const columnSelect   = document.getElementById('columnSelect');
const fileInfo       = document.getElementById('fileInfo');
const fileNameText   = document.getElementById('fileName');

const concurrencyInput = document.getElementById('concurrencyInput');
const sheetWebhookUrl = document.getElementById('sheetWebhookUrl');
const modal           = document.getElementById('screenshotModal');
const modalImg        = document.getElementById('modalImg');
const closeModal      = document.querySelector('.close-modal');

// -- Outreach Refs --
const outreachDrop      = document.getElementById('outreachDrop');
const outreachFile      = document.getElementById('outreachFile');
const outreachLeadList  = document.getElementById('outreachLeadList');
const outreachSubject   = document.getElementById('outreachSubject');
const outreachTemplate  = document.getElementById('outreachTemplate');
const outreachProcessBtn = document.getElementById('outreachProcessBtn');
const selectAllBtn      = document.getElementById('selectAllBtn');
const deselectAllBtn    = document.getElementById('deselectAllBtn');
const outreachLeadCount = document.getElementById('outreachLeadCount');

let outreachLeads = [];
let currentChannel = 'gmail';

// ── State Persistence ──────────────────────────────────────
const persistFields = {
  outreachSubject: 'outreachSubject',
  outreachTemplate: 'outreachTemplate',
  concurrencyInput: 'auditConcurrency',
  sheetWebhookUrl: 'sheetWebhookUrl'
};

function saveUIState() {
  const state = {};
  for (const [id, key] of Object.entries(persistFields)) {
    const el = document.getElementById(id);
    if (el) state[key] = el.value;
  }
  state.currentChannel = currentChannel;
  state.outreachLeads = outreachLeads;
  chrome.storage.local.set({ uiState: state });
}

function loadUIState() {
  chrome.storage.local.get(['uiState'], (data) => {
    const state = data.uiState;
    if (!state) return;
    
    for (const [id, key] of Object.entries(persistFields)) {
      const el = document.getElementById(id);
      if (el && state[key]) el.value = state[key];
    }
    
    if (state.currentChannel) {
      currentChannel = state.currentChannel;
      document.querySelectorAll('.channel-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.channel === currentChannel);
      });
    }
    
    if (state.outreachLeads) {
      outreachLeads = state.outreachLeads;
      if (outreachLeads.length > 0) {
        document.getElementById('outreachFileInfo').style.display = 'block';
        document.getElementById('outreachFileName').textContent = `Restored Session (${outreachLeads.length} leads)`;
        renderOutreachLeads();
      }
    }
  });
}

// Bind Auto-Save
['input', 'change'].forEach(evt => {
  document.addEventListener(evt, (e) => {
    if (persistFields[e.target.id] || e.target.classList.contains('channel-btn')) {
      saveUIState();
    }
  });
});

// ── Tabs Logic ────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
  });
});

// Load state on startup
document.addEventListener('DOMContentLoaded', loadUIState);


// ── Full Screen Logic ─────────────────────────────────────
const isFullScreen = new URLSearchParams(window.location.search).has('fullscreen');
if (isFullScreen) {
  document.body.classList.add('fullscreen');
}
document.getElementById('fullscreenBtn').onclick = () => {
  if (isFullScreen) return; // Already full screen
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?fullscreen=1') });
};

// ── UI Updates ────────────────────────────────────────────
function updateUI(state) {
  if (!state) return;
  const successLeads = state.results.filter(r => 
    r.email || r.phone || (r.linkedinLinks && r.linkedinLinks.length > 0)
  ).length;
  const waFound = state.results.filter(r => r.isWhatsApp).length;

  statLeads.textContent = state.currentIndex;
  statEmails.textContent = successLeads; // Now shows Universal Success
  statWhatsApp.textContent = waFound;

  if (state.urls.length > 0) {
    const pct = Math.round((state.currentIndex / state.urls.length) * 100);
    progressBar.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    progressText.textContent = state.isRunning ? `Running: ${state.currentIndex} / ${state.urls.length}` : `Paused: ${state.currentIndex} / ${state.urls.length}`;
    document.getElementById('progressSection').style.display = 'block';
    
    // Update Live Task Card
    const currentUrl = state.isRunning ? state.urls[state.currentIndex] || 'Processing...' : 'Waiting for Audit...';
    document.getElementById('currentTaskUrl').textContent = truncate(currentUrl.replace('https://','').replace('http://',''), 20);
    document.querySelector('.pulse-icon').style.animation = state.isRunning ? 'pulse 2s infinite' : 'none';
    document.querySelector('.pulse-icon').style.background = state.isRunning ? 'var(--success)' : '#cbd5e1';
    
    if (state.currentIndex >= state.urls.length && !state.isRunning) {
      saveSessionToHistory(state);
    }
  }

  // Button logic for Resuming
  if (state.isRunning) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  } else {
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    startBtn.textContent = state.currentIndex > 0 ? 'Resume Audit' : 'Start Master Audit';
  }
  
  if (state.results.length > 0) {
    exportBtn.style.display = 'block';
    exportVisualBtn.style.display = 'block';
  }

  renderAuditResults(state.results);
  renderLogs(state.logs);
}

function renderAuditResults(results) {
  const container = document.getElementById('auditResultsList');
  if (!container) return;
  
  if (!results || results.length === 0) {
    container.innerHTML = `<div class="empty-hint">No leads found yet. Start the audit!</div>`;
    return;
  }

  container.innerHTML = '';
  // Show latest leads at top
  [...results].reverse().forEach((res, index) => {
    const card = document.createElement('div');
    card.className = 'audit-result-card';
    const hasProof = res.screenshots && res.screenshots.length > 0;
    
    card.innerHTML = `
      <div class="audit-card-header">
        <div class="audit-biz-info">
          <div class="audit-biz-name">${esc(res.name || 'Unknown Business')}</div>
          <div class="audit-biz-site">${esc(res.website || res.url)}</div>
        </div>
        <div class="audit-status-badges">
          ${res.technicalReason ? `<span class="status-badge status-warning" style="background:#fef2f2;color:#ef4444;border:1px solid #fca5a5;">${esc(res.technicalReason)}</span>` : ''}
          <span class="status-badge ${res.deliverability === 'Deliverable' ? 'status-success' : 'status-warning'}">
            ${res.deliverability || 'Pending'}
          </span>
          ${res.isWhatsApp ? '<span class="status-badge status-wa">WA Verified</span>' : ''}
        </div>
      </div>
      <div class="audit-card-body">
        <div class="audit-info-grid">
          <div class="audit-info-item"><span class="audit-label">Best Email</span><span class="audit-value">${res.bestEmail || res.email || '<span class="text-muted">Not Found</span>'}</span></div>
          <div class="audit-info-item"><span class="audit-label">Email Type</span><span class="audit-value">${res.emailType || 'N/A'}</span></div>
          <div class="audit-info-item"><span class="audit-label">Phone</span><span class="audit-value">${res.phone || '<span class="text-muted">N/A</span>'}</span></div>
          <div class="audit-info-item"><span class="audit-label">Best LinkedIn</span><span class="audit-value truncate"><a href="${res.bestLinkedIn || (res.linkedinLinks && res.linkedinLinks[0]) || '#'}" target="_blank">${res.bestLinkedIn || (res.linkedinLinks && res.linkedinLinks[0]) ? 'View Profile' : '<span class="text-muted">N/A</span>'}</a></span></div>
          <div class="audit-info-item"><span class="audit-label">Address</span><span class="audit-value truncate">${esc(res.address || 'N/A')}</span></div>
          <div class="audit-info-item"><span class="audit-label">Confidence</span><span class="audit-value" style="color: ${res.confidenceScore > 50 ? 'var(--success)' : 'var(--warning)'}; font-weight: 800;">${res.confidenceScore || 0}%</span></div>
        </div>
      </div>
      <div class="audit-card-footer">
        <div class="audit-social-links">
          ${res.social?.facebook ? `<a href="${res.social.facebook}" target="_blank" title="Facebook" class="social-pill fb">FB</a>` : ''}
          ${res.social?.instagram ? `<a href="${res.social.instagram}" target="_blank" title="Instagram" class="social-pill ig">IG</a>` : ''}
          ${res.social?.twitter ? `<a href="${res.social.twitter}" target="_blank" title="Twitter/X" class="social-pill tw">𝕏</a>` : ''}
          ${res.social?.youtube ? `<a href="${res.social.youtube}" target="_blank" title="YouTube" class="social-pill yt">YT</a>` : ''}
          ${res.social?.tiktok ? `<a href="${res.social.tiktok}" target="_blank" title="TikTok" class="social-pill tt">TT</a>` : ''}
          ${res.social?.pinterest ? `<a href="${res.social.pinterest}" target="_blank" title="Pinterest" class="social-pill pt">PT</a>` : ''}
          ${res.linkedinLinks && res.linkedinLinks.length > 0 ? `<a href="${res.linkedinLinks[0]}" target="_blank" title="LinkedIn" class="social-pill li">LI</a>` : ''}
        </div>
        <button class="audit-proof-btn view-ss-btn" data-index="${index}" ${!hasProof ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          ${hasProof ? `VIEW PROOF (${res.screenshots.length})` : 'NO PROOF (N/A)'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Re-bind click events for reversed list
  const revResults = [...results].reverse();
  document.querySelectorAll('.view-ss-btn').forEach((btn, bIdx) => {
    btn.onclick = () => {
      const screenshots = revResults[bIdx].screenshots;
      if (screenshots && screenshots.length > 0) {
        modalImg.src = screenshots[0].img;
        modal.style.display = 'flex';
      }
    };
  });
}

function renderLogs(logs) {
  if (!logs) return;
  logsContainer.innerHTML = logs.map(log => {
    let icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    if (log.type === 'success') icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    if (log.type === 'error') icon = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    return `<div class="log-entry ${log.type}">
      <span class="log-time">[${log.time}]</span>
      <span class="log-icon-inline">${icon}</span>
      <span class="log-msg">${esc(log.message)}</span>
    </div>`;
  }).join('');
}

// ── Export ───────────────────────────────────────────────
exportBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
    buildAndDownload3SheetExcel(state.results, `elite_audit_master_${new Date().toISOString().slice(0,10)}.xlsx`);
  });
};

exportVisualBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
    const leads = state.results.filter(r => r.email || r.phone || (r.linkedinLinks && r.linkedinLinks.length > 0));
    
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Elite Audit: Visual Dossier</title>
      <style>
        :root { --primary: #4f46e5; --bg: #f8fafc; --text: #0f172a; --card-bg: #ffffff; --border: #e2e8f0; }
        body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 40px; margin: 0; }
        .header { text-align: center; margin-bottom: 40px; background: #1e293b; color: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header h1 { margin: 0; font-size: 32px; letter-spacing: -1px; }
        .header p { opacity: 0.7; margin: 10px 0 0; font-size: 14px; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
        .card { background: var(--card-bg); border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border); overflow: hidden; transition: transform 0.2s; }
        .card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        
        .card-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; }
        .biz-name { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; line-height: 1.2; }
        .biz-site { font-size: 12px; color: var(--primary); font-weight: 600; margin-top: 4px; }
        .badge { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; }
        .badge-success { background: #dcfce7; color: #16a34a; }
        .badge-wa { background: #e0f2fe; color: #0369a1; }
        
        .card-body { padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .info-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .value { font-size: 12px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .card-footer { background: #f8fafc; padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .socials { display: flex; gap: 8px; }
        .socials a { font-size: 10px; font-weight: 800; color: #475569; text-decoration: none; border: 1px solid var(--border); padding: 3px 8px; border-radius: 5px; }
        .proof-btn { background: #1e293b; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .proof-btn:hover:not(:disabled) { background: var(--primary); }
        .proof-btn:disabled { opacity: 0.4; }

        #modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(10px); display: none; justify-content: center; align-items: center; z-index: 9999; padding: 40px; }
        #modal.active { display: flex; }
        .modal-container { position: relative; max-width: 90%; max-height: 90%; background: white; padding: 8px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .modal-img { max-width: 100%; max-height: 80vh; display: block; border-radius: 10px; }
        .modal-label { position: absolute; top: -40px; left: 0; color: white; font-weight: 800; font-size: 16px; text-transform: uppercase; }
        .close-btn { position: absolute; top: -45px; right: 0; color: white; font-size: 32px; cursor: pointer; background: none; border: none; }
        .nav-arrow { position: absolute; top: 50%; transform: translateY(-50%); background: white; border: none; width: 48px; height: 48px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
        .nav-left { left: -64px; } .nav-right { right: -64px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Elite Visual Dossier</h1>
        <p>Total Leads: <strong>${leads.length}</strong> | Forensic Audit Report: ${new Date().toLocaleDateString()}</p>
      </div>

      <div class="grid">
        ${leads.map((r, i) => `
          <div class="card">
            <div class="card-header">
              <div>
                <div class="biz-name">${r.name || 'Unknown Business'}</div>
                <div class="biz-site">${r.website}</div>
              </div>
              <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end">
                <span class="badge badge-success">${r.deliverability || 'Pending'}</span>
                ${r.isWhatsApp ? '<span class="badge badge-wa">WA Verified</span>' : ''}
              </div>
            </div>
            <div class="card-body">
              <div class="info-item"><span class="label">Email</span><span class="value">${r.email || 'N/A'}</span></div>
              <div class="info-item"><span class="label">Phone</span><span class="value">${r.phone || 'N/A'}</span></div>
              <div class="info-item"><span class="label">LinkedIn</span><span class="value">${r.linkedinLinks ? r.linkedinLinks.length : 0} Profile(s)</span></div>
              <div class="info-item"><span class="label">Address</span><span class="value">${r.address || 'N/A'}</span></div>
            </div>
            <div class="card-footer">
              <div class="socials">
                ${r.social?.facebook ? `<a href="${r.social.facebook}" target="_blank">FB</a>` : ''}
                ${r.social?.instagram ? `<a href="${r.social.instagram}" target="_blank">IG</a>` : ''}
              </div>
              <button class="proof-btn" ${(!r.screenshots || r.screenshots.length === 0) ? 'disabled' : `onclick='openGallery(${JSON.stringify(r.screenshots).replace(/'/g, "&apos;")})'`}>
                VIEW PROOF (${(r.screenshots || []).length})
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <div id="modal">
        <button class="close-btn" onclick="closeModal()">&times;</button>
        <div class="modal-container">
          <div id="modal-title" class="modal-label">Proof</div>
          <button id="prevBtn" class="nav-arrow nav-left" onclick="changeImage(-1)">&#8249;</button>
          <img id="modal-image" class="modal-img" src="">
          <button id="nextBtn" class="nav-arrow nav-right" onclick="changeImage(1)">&#8250;</button>
        </div>
      </div>

      <script>
        let currentGallery = [];
        let currentIndex = 0;
        const modal = document.getElementById('modal');
        const modalImg = document.getElementById('modal-image');
        const modalTitle = document.getElementById('modal-title');

        function openGallery(screenshots) {
          currentGallery = screenshots; currentIndex = 0;
          updateModal();
          modal.classList.add('active');
        }
        function closeModal() { modal.classList.remove('active'); }
        function changeImage(step) {
          currentIndex = (currentIndex + step + currentGallery.length) % currentGallery.length;
          updateModal();
        }
        function updateModal() {
          const item = currentGallery[currentIndex];
          modalImg.src = item.img;
          modalTitle.innerText = item.label + " (" + (currentIndex + 1) + "/" + currentGallery.length + ")";
          document.getElementById('prevBtn').style.display = currentGallery.length > 1 ? 'flex' : 'none';
          document.getElementById('nextBtn').style.display = currentGallery.length > 1 ? 'flex' : 'none';
        }
        window.onclick = function(event) { if (event.target == modal) closeModal(); }
      </script>
    </body>
    </html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `elite_visual_dossier_${new Date().toISOString().slice(0,10)}.html`;
    a.click();
  });
};

// ── Other Logic ──────────────────────────────────────────
closeModal.onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

fileDrop.onclick = () => csvFile.click();
csvFile.onchange = (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
};

function handleFile(file) {
  const reader = new FileReader();
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') {
    reader.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      processRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }), file.name);
    };
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = e => processRows(e.target.result.split('\n').map(l => l.split(',')), file.name);
    reader.readAsText(file);
  }
}

function processRows(rows, name) {
  const headers = rows[0];
  fileNameText.textContent = name;
  fileInfo.style.display = 'flex';
  columnSelect.innerHTML = '<option value="">URL Column</option>' + headers.map((h, i) => `<option value="${i}">${h || `Col ${i+1}`}</option>`).join('');
  columnSelect.onchange = () => {
    const col = parseInt(columnSelect.value);
    parsedUrls = rows.slice(1).map(r => {
      const cellText = (r[col]||'').toString().trim();
      
      let namePart = '';
      if (cellText.includes('->')) namePart = cellText.split('->')[0].trim() + ' -> ';
      else if (cellText.includes('=>')) namePart = cellText.split('=>')[0].trim() + ' -> ';
      else if (cellText.includes('→')) namePart = cellText.split('→')[0].trim() + ' -> ';

      const httpMatch = cellText.match(/(https?:\/\/[^\s]+)/);
      if (httpMatch) return namePart + httpMatch[1];
      
      const domainMatch = cellText.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (domainMatch && !domainMatch[1].includes('@')) return namePart + 'https://' + domainMatch[1];
      
      return '';
    }).filter(u => u.includes('http'));
    statusText.textContent = `${parsedUrls.length} links loaded.`;
  };
}

startBtn.onclick = () => {
  if (!parsedUrls.length) return alert('Load file first!');
  const s = { concurrency: parseInt(concurrencyInput.value), googleSheetUrl: sheetWebhookUrl.value.trim() };
  chrome.runtime.sendMessage({ action: 'startExtraction', urls: parsedUrls, ...s }, (resp) => {
    if (chrome.runtime.lastError) console.log('Notice: Background starting...');
  });
};

stopBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'stopExtraction' }, (resp) => {
    if (chrome.runtime.lastError) console.log('Notice: Background stopping...');
  });
};

clearBtn.onclick = () => {
  if (confirm('Reset dashboard and session?')) {
    chrome.runtime.sendMessage({ action: 'clearState' }, () => {
      location.reload();
    });
  }
};

chrome.runtime.sendMessage({ action: 'getState' }, (state) => {
  if (state) updateUI(state);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateUI') updateUI(msg.state);
  if (msg.action === 'outreachProgress') {
    const pct = msg.percent;
    document.getElementById('outreachProgressBar').style.width = pct + '%';
    document.getElementById('outreachProgressPct').textContent = pct + '%';
    if (pct === 100) {
      addLog('Outreach', 'Turbo Campaign Complete! Check your tabs.', 'success');
      alert('Turbo Mode Complete! All drafts are ready.');
    }
  }
});

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : s; }

function addLog(source, message, type = 'info') {
  chrome.runtime.sendMessage({ action: 'addLog', source, message, type });
}

function saveSessionToHistory(state) {
  chrome.storage.local.get(['extractionHistory'], (data) => {
    let history = data.extractionHistory || [];
    const timestamp = new Date().toLocaleString();
    if (history.length > 0 && history[0].date === timestamp) return;
  history.unshift({ date: timestamp, total: state.results.length, emails: state.results.filter(r => r.email).length, logs: state.logs, results: state.results });
    chrome.storage.local.set({ extractionHistory: history.slice(0, 15) });
  });
}

function loadHistory() {
  chrome.storage.local.get(['extractionHistory'], (data) => {
    const history = data.extractionHistory || [];
    historyList.innerHTML = history.map((h, idx) => `
      <div class="history-item">
        <div class="hist-main">
          <span class="hist-date">${h.date}</span>
          <div class="hist-stats">
            <span style="color:var(--success)">${h.emails} Leads</span>
            <span style="color:var(--secondary)">${h.total} Total</span>
          </div>
        </div>
        <div class="hist-actions">
          <button class="hist-action-btn download-hist-excel" data-idx="${idx}" title="Download Excel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          </button>
          <button class="hist-action-btn report view-hist-report" data-idx="${idx}" title="View Visual Report">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M9 17h6"></path><path d="M9 12h6"></path><path d="M9 8h6"></path></svg>
          </button>
          <button class="hist-action-btn view-hist-log" data-idx="${idx}" title="View Logs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
          </button>
        </div>
      </div>
    `).join('') || '<p class="empty-hint">No history yet.</p>';
    
    // Bind History Actions
    document.querySelectorAll('.download-hist-excel').forEach(btn => {
      btn.onclick = () => downloadExcelFromData(history[btn.dataset.idx].results);
    });
    document.querySelectorAll('.view-hist-report').forEach(btn => {
      btn.onclick = () => generateVisualReport(history[btn.dataset.idx].results);
    });
    document.querySelectorAll('.view-hist-log').forEach(btn => {
      btn.onclick = () => {
        document.querySelector('[data-tab="logs"]').click();
        renderLogs(history[btn.dataset.idx].logs);
      };
    });
  });
}

// ── Shared Export Functions ──────────────────────────────

function constructVisualReportHTML(leads) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Elite Audit: Visual Dossier</title>
      <style>
        :root { --primary: #4f46e5; --bg: #f8fafc; --text: #0f172a; --card-bg: #ffffff; --border: #e2e8f0; }
        body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 40px; margin: 0; }
        .header { text-align: center; margin-bottom: 40px; background: #1e293b; color: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .header h1 { margin: 0; font-size: 32px; letter-spacing: -1px; }
        .header p { opacity: 0.7; margin: 10px 0 0; font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 24px; }
        .card { background: var(--card-bg); border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border); overflow: hidden; transition: transform 0.2s; }
        .card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
        .card-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start; }
        .biz-name { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; line-height: 1.2; }
        .biz-site { font-size: 12px; color: var(--primary); font-weight: 600; margin-top: 4px; }
        .badge { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; }
        .badge-success { background: #dcfce7; color: #16a34a; }
        .badge-warn { background: #fef9c3; color: #a16207; }
        .badge-wa { background: #e0f2fe; color: #0369a1; }
        .card-body { padding: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .info-item { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
        .value { font-size: 12px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-footer { background: #f8fafc; padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .socials { display: flex; gap: 8px; }
        .socials a { font-size: 10px; font-weight: 800; color: #475569; text-decoration: none; border: 1px solid var(--border); padding: 3px 8px; border-radius: 5px; }
        .proof-btn { background: #1e293b; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; }
        .proof-btn:hover:not(:disabled) { background: var(--primary); }
        .proof-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        #modal { position: fixed; inset: 0; background: rgba(15,23,42,0.9); backdrop-filter: blur(10px); display: none; justify-content: center; align-items: center; z-index: 9999; padding: 40px; }
        #modal.active { display: flex; }
        .modal-container { position: relative; max-width: 90%; max-height: 90%; background: white; padding: 8px; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .modal-img { max-width: 100%; max-height: 80vh; display: block; border-radius: 10px; }
        .modal-label { position: absolute; top: -40px; left: 0; color: white; font-weight: 800; font-size: 16px; text-transform: uppercase; }
        .close-btn { position: absolute; top: -45px; right: 0; color: white; font-size: 32px; cursor: pointer; background: none; border: none; }
        .nav-arrow { position: absolute; top: 50%; transform: translateY(-50%); background: white; border: none; width: 48px; height: 48px; border-radius: 50%; font-size: 24px; cursor: pointer; box-shadow: 0 10px 20px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
        .nav-left { left: -64px; } .nav-right { right: -64px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Elite Visual Dossier</h1>
        <p>Total Leads: <strong>${leads.length}</strong> | Forensic Audit Report: ${new Date().toLocaleDateString()}</p>
      </div>
      <div class="grid">
        ${leads.map((r) => `
          <div class="card">
            <div class="card-header">
              <div>
                <div class="biz-name">${r.name || 'Unknown Business'}</div>
                <div class="biz-site">${r.website || ''}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                <span class="badge ${r.deliverability === 'Deliverable' ? 'badge-success' : 'badge-warn'}">${r.deliverability || 'Pending'}</span>
                ${r.isWhatsApp ? '<span class="badge badge-wa">WA Verified</span>' : ''}
              </div>
            </div>
            <div class="card-body">
              <div class="info-item"><span class="label">Email</span><span class="value">${r.email || 'N/A'}</span></div>
              <div class="info-item"><span class="label">Phone</span><span class="value">${r.phone || 'N/A'}</span></div>
              <div class="info-item"><span class="label">LinkedIn</span><span class="value">${(r.linkedinLinks || []).length} Profile(s)</span></div>
              <div class="info-item"><span class="label">Address</span><span class="value">${r.address || 'N/A'}</span></div>
            </div>
            <div class="card-footer">
              <div class="socials">
                ${r.social?.facebook ? `<a href="${r.social.facebook}" target="_blank">FB</a>` : ''}
                ${r.social?.instagram ? `<a href="${r.social.instagram}" target="_blank">IG</a>` : ''}
              </div>
              <button class="proof-btn" ${(!r.screenshots || r.screenshots.length === 0) ? 'disabled' : `onclick='openGallery(${JSON.stringify(r.screenshots).replace(/'/g, "&apos;")})'`}>
                VIEW PROOF (${(r.screenshots || []).length})
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <div id="modal">
        <button class="close-btn" onclick="closeModal()">&times;</button>
        <div class="modal-container">
          <div id="modal-title" class="modal-label">Proof</div>
          <button id="prevBtn" class="nav-arrow nav-left" onclick="changeImage(-1)">&#8249;</button>
          <img id="modal-image" class="modal-img" src="">
          <button id="nextBtn" class="nav-arrow nav-right" onclick="changeImage(1)">&#8250;</button>
        </div>
      </div>

      <script>
        let currentGallery = [], currentIndex = 0;
        const modal = document.getElementById('modal');
        function openGallery(s) { currentGallery = s; currentIndex = 0; updateModal(); modal.classList.add('active'); }
        function closeModal() { modal.classList.remove('active'); }
        function changeImage(step) { currentIndex = (currentIndex + step + currentGallery.length) % currentGallery.length; updateModal(); }
        function updateModal() {
          const item = currentGallery[currentIndex];
          document.getElementById('modal-image').src = item.img;
          document.getElementById('modal-title').innerText = item.label + ' (' + (currentIndex+1) + '/' + currentGallery.length + ')';
          document.getElementById('prevBtn').style.display = currentGallery.length > 1 ? 'flex' : 'none';
          document.getElementById('nextBtn').style.display = currentGallery.length > 1 ? 'flex' : 'none';
        }
        window.onclick = (e) => { if (e.target === modal) closeModal(); }
      <\/script>
    </body>
    </html>`;
}


function buildAndDownload3SheetExcel(results, filename) {
  if (!results || results.length === 0) return alert('No data to export');

  // Sheet 1: Successful Leads (Filtered)
  const successfulLeads = results.filter(r => r.confidenceScore >= 20 || r.bestEmail || r.phone || r.bestLinkedIn).map(r => ({
    Company_Name: r.name || 'N/A',
    Website: r.website || 'N/A',
    Best_Email: r.bestEmail || r.email || 'N/A',
    Email_Type: r.emailType || 'N/A',
    Email_Status: r.bestEmail ? (r.deliverability || 'Pending') : 'N/A',
    Phone: r.phone || 'N/A',
    Is_WhatsApp: r.isWhatsApp ? 'TRUE' : 'FALSE',
    Best_LinkedIn: r.bestLinkedIn || (r.linkedinLinks && r.linkedinLinks[0]) || 'N/A',
    Address: r.address || 'N/A',
    Confidence_Score: r.confidenceScore + '%'
  }));

  // Sheet 2: ALL RAW DATA (Every single piece of data on its own row)
  const allRawData = [];
  results.forEach(r => {
    // Add all emails
    if (r.emails && r.emails.length > 0) {
      r.emails.forEach(e => allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'Email', Value: e, Confidence: r.confidenceScore + '%' }));
    } else if (r.email) {
      allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'Email', Value: r.email, Confidence: r.confidenceScore + '%' });
    }

    // Add Phone(s)
    if (r.phones && r.phones.length > 0) {
      r.phones.forEach(p => allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'Phone', Value: p, Confidence: r.confidenceScore + '%' }));
    } else if (r.phone) {
      allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'Phone', Value: r.phone, Confidence: r.confidenceScore + '%' });
    }

    // Add all LinkedIn Profiles
    if (r.linkedinLinks && r.linkedinLinks.length > 0) {
      r.linkedinLinks.forEach(l => allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'LinkedIn', Value: l, Confidence: r.confidenceScore + '%' }));
    }

    // Add Social Links
    if (r.social) {
      for (const [platform, link] of Object.entries(r.social)) {
        if (link) allRawData.push({ Company: r.name, Website: r.website, Data_Type: 'Social (' + platform + ')', Value: link, Confidence: r.confidenceScore + '%' });
      }
    }
  });

  // Sheet 3: Technical Report (Logs / Failure Reasons)
  const technicalLogs = results.filter(r => r.technicalReason || r.confidenceScore === 0).map(r => ({
    Company: r.name || 'N/A',
    Website: r.website || 'N/A',
    Failure_Reason: r.technicalReason || 'NO_CONTACT_DATA_FOUND',
    Action_Required: r.technicalReason === 'CAPTCHA_BLOCKED' || r.technicalReason === 'ACCESS_DENIED' ? 'Manual Verification Needed' : 'None'
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(successfulLeads), 'Successful Leads');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRawData), 'All Raw Data');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(technicalLogs), 'Technical Report');
  
  XLSX.writeFile(wb, filename);
}

function downloadExcelFromData(results) {
  buildAndDownload3SheetExcel(results, `audit_history_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function generateVisualReport(results) {
  if (!results || results.length === 0) return alert('No data to report');
  const leads = results.filter(r => r.email || r.phone || (r.linkedinLinks && r.linkedinLinks.length > 0));
  downloadHTMLReport(constructVisualReportHTML(leads));
}

function downloadHTMLReport(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `elite_report_${new Date().toISOString().slice(0,10)}.html`;
  a.click();
}

// ── Outreach Tab Logic ────────────────────────────────────

document.querySelectorAll('.channel-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentChannel = btn.dataset.channel;
    renderOutreachLeads();
  };
});

outreachDrop.onclick = () => outreachFile.click();
outreachFile.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    outreachLeads = rows.map(r => ({
      name: r.Business_Name || r.Company_Name || r.name || 'Unknown',
      company: r.Business_Name || r.Company_Name || r.name || 'Unknown',
      email: r.Email || r.email || '',
      phone: r.Phone || r.Phone_Number || r.phone || '',
      linkedin: r.Top_Profile || r.LinkedIn || '',
      website: r.Website || r.website || '',
      leadType: r.Lead_Type || 'Unknown',
      isWhatsApp: (r.Is_WhatsApp === 'TRUE' || r.Is_WhatsApp === true),
      selected: true
    })).filter(r => r.email || r.phone || r.linkedin); // Only keep leads with contact info
    document.getElementById('outreachFileInfo').style.display = 'block';
    document.getElementById('outreachFileName').textContent = `${file.name} (${outreachLeads.length} leads)`;
    saveUIState();
    renderOutreachLeads();
  };
  reader.readAsArrayBuffer(file);
};

// ── Smart Filtered Selection ──────────────────────────────
selectAllBtn.onclick = () => { 
  const filteredIdxs = getFilteredLeads().map(l => l._idx);
  outreachLeads.forEach((l, idx) => {
    if (filteredIdxs.includes(idx)) l.selected = true;
  });
  saveUIState();
  renderOutreachLeads(); 
};

deselectAllBtn.onclick = () => { 
  const filteredIdxs = getFilteredLeads().map(l => l._idx);
  outreachLeads.forEach((l, idx) => {
    if (filteredIdxs.includes(idx)) l.selected = false;
  });
  saveUIState();
  renderOutreachLeads(); 
};

const isNa = (val) => !val || val === 'N/A' || val === 'n/a' || val === 'undefined' || val === 'null' || val === '';

function getFilteredLeads() {
  return outreachLeads.map((l, idx) => ({...l, _idx: idx})).filter(l => {
    if (currentChannel === 'gmail') return !isNa(l.email);
    if (currentChannel === 'linkedin') return !isNa(l.linkedin);
    if (currentChannel === 'whatsapp') return !isNa(l.phone);
    return true;
  });
}

function renderOutreachLeads() {
  const filtered = getFilteredLeads();

  const active = filtered.filter(l => l.selected).length;
  const totalForChannel = filtered.length;
  outreachLeadCount.textContent = `${active} / ${totalForChannel} for ${currentChannel.charAt(0).toUpperCase() + currentChannel.slice(1)}`;

  // Update channel button counts
  const emailCount = outreachLeads.filter(l => !isNa(l.email)).length;
  const linkedinCount = outreachLeads.filter(l => !isNa(l.linkedin)).length;
  const whatsappCount = outreachLeads.filter(l => !isNa(l.phone)).length;
  
  document.querySelectorAll('.channel-btn').forEach(btn => {
    const ch = btn.dataset.channel;
    const countEl = btn.querySelector('.ch-count');
    if (countEl) {
      countEl.textContent = ch === 'gmail' ? emailCount : ch === 'linkedin' ? linkedinCount : whatsappCount;
    }
  });

  if (filtered.length === 0 && outreachLeads.length > 0) {
    outreachLeadList.innerHTML = `<div class="empty-outreach">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      <p>Zero valid leads for <strong>${currentChannel}</strong></p>
    </div>`;
    return;
  }

  outreachLeadList.innerHTML = filtered.map(l => {
    const typeColor = l.leadType.includes('Full') ? '#059669' : l.leadType.includes('Email') ? '#2563eb' : '#f59e0b';
    const contactLine = currentChannel === 'gmail' ? l.email : currentChannel === 'linkedin' ? truncate(l.linkedin, 35) : l.phone;
    
    return `
    <div class="outreach-lead-card ${l.selected ? '' : 'removed'}">
      <div class="outreach-lead-avatar" style="background:linear-gradient(135deg, ${typeColor}, ${typeColor}dd)">${l.name.charAt(0).toUpperCase()}</div>
      <div class="outreach-lead-info">
        <div class="outreach-lead-name">${esc(l.name)}</div>
        <div class="outreach-lead-detail">${esc(contactLine)}</div>
        <div class="outreach-lead-meta">
          <span class="outreach-type-badge" style="color:${typeColor};border-color:${typeColor}33;background:${typeColor}11">${esc(l.leadType)}</span>
          <div class="outreach-card-actions">
            ${l.email ? `<button class="mini-action-btn direct-gmail" data-idx="${l._idx}" title="Gmail Draft">✉️</button>` : ''}
            ${l.linkedin ? `<button class="mini-action-btn direct-linkedin" data-idx="${l._idx}" title="Open LinkedIn">🔗</button>` : ''}
            ${l.phone ? `<button class="mini-action-btn direct-whatsapp" data-idx="${l._idx}" title="WhatsApp Chat">💬</button>` : ''}
          </div>
        </div>
      </div>
      <button class="remove-card-btn toggle-lead-btn" data-idx="${l._idx}" title="${l.selected ? 'Exclude' : 'Include'}">
        ${l.selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>'}
      </button>
    </div>`;
  }).join('') || '<div class="empty-outreach"><p>Upload your audit report to begin</p></div>';

  document.querySelectorAll('.toggle-lead-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      outreachLeads[idx].selected = !outreachLeads[idx].selected;
      saveUIState();
      renderOutreachLeads();
    });
  });

  // Bind Direct Actions
  document.querySelectorAll('.mini-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const lead = outreachLeads[idx];
      const template = outreachTemplate.value;
      const subject = outreachSubject.value;
      
      const msg = template
        .replace(/{{name}}/g, lead.name)
        .replace(/{{company}}/g, lead.company)
        .replace(/{{email}}/g, lead.email);
      
      const sub = subject
        .replace(/{{company}}/g, lead.company)
        .replace(/{{name}}/g, lead.name);

      if (btn.classList.contains('direct-gmail')) {
        const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(sub)}&body=${encodeURIComponent(msg)}`;
        chrome.tabs.create({ url });
      } else if (btn.classList.contains('direct-linkedin')) {
        let liUrl = lead.linkedin;
        if (liUrl && !liUrl.startsWith('http')) liUrl = 'https://' + liUrl;
        chrome.tabs.create({ url: liUrl });
        navigator.clipboard.writeText(msg);
        addLog('Outreach', `LinkedIn profile opened & message copied for ${lead.name}`, 'info');
      } else if (btn.classList.contains('direct-whatsapp')) {
        const cleanPhone = lead.phone.replace(/\D/g,'');
        const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
        chrome.tabs.create({ url });
      }
    });
  });
}

outreachProcessBtn.onclick = async () => {
  const filtered = getFilteredLeads();
  const selected = filtered.filter(l => l.selected);
  if (selected.length === 0) return alert("Select at least one valid lead for this channel");
  
  const template = outreachTemplate.value;
  const subject = outreachSubject.value;
  
  if (!confirm(`Launch Turbo Mode? This will open ${selected.length} tabs in the background.`)) return;

  addLog('Outreach', `Campaign handed to background for ${selected.length} leads...`, 'info');
  document.getElementById('outreachProgress').style.display = 'block';
  
  // Send to background so it doesn't stop if popup closes
  chrome.runtime.sendMessage({
    action: 'startOutreachCampaign',
    leads: selected,
    template: template,
    subject: subject,
    channel: currentChannel
  });
};

// Listen for background progress
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'outreachProgress') {
    const pct = msg.percent;
    document.getElementById('outreachProgressBar').style.width = pct + '%';
    document.getElementById('outreachProgressPct').textContent = pct + '%';
    if (pct === 100) {
      addLog('Outreach', 'Turbo Campaign Complete! Check your tabs.', 'success');
      alert("Turbo Mode Complete! All drafts are ready.");
    }
  }
});


