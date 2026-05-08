let state = { isScanning: false, results: [], currentIndex: 0, targetUrls: [], logs: [] };

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fileInput = document.getElementById('csvFile');
  const dropZone = document.getElementById('fileDrop');

  // Sidebar Logic
  const tabs = document.querySelectorAll('.nav-btn');
  const panes = document.querySelectorAll('.tab-pane');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(btn => btn.classList.remove('active'));
    panes.forEach(p => p.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  }));

  const fullscreenBtn = document.getElementById('fullscreenBtn');
  fullscreenBtn.addEventListener('click', () => {
    document.body.classList.toggle('fullscreen');
  });

  // Modal Logic
  document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('screenshotModal').style.display = 'none';
  });

  // Fetch State
  chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
    if (res) { state = res; renderUI(); }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'updateUI') {
      state = msg.state;
      if (msg.currentTaskUrl) {
        document.getElementById('currentTaskUrl').innerText = msg.currentTaskUrl;
      }
      renderUI();
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileUpload);

  startBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'start', urls: state.targetUrls });
  });

  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pause' });
  });

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clear' }, () => {
      state = { isScanning: false, results: [], currentIndex: 0, targetUrls: [], logs: [] };
      document.getElementById('currentTaskUrl').innerText = 'Idle...';
      renderUI();
    });
  });

  exportBtn.addEventListener('click', exportToExcel);
});

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let urls = [];
  for (let i = 0; i < json.length; i++) {
    const row = json[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j]).trim();
      if (cell.includes('.') && !cell.includes('@') && cell.length > 4) {
        const httpMatch = cell.match(/(https?:\/\/[^\s]+)/);
        if (httpMatch) {
          urls.push(httpMatch[1]);
          break;
        } else {
          const domainMatch = cell.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (domainMatch && !domainMatch[1].includes('@')) {
            urls.push('https://' + domainMatch[1]);
            break;
          }
        }
      }
    }
  }

  urls = [...new Set(urls)];
  if (urls.length > 0) {
    state.targetUrls = urls;
    renderUI();
  } else {
    alert("No valid website URLs found in the file.");
  }
}

function renderUI() {
  document.getElementById('startBtn').disabled = state.isScanning || state.targetUrls.length === 0;
  document.getElementById('pauseBtn').disabled = !state.isScanning;
  document.getElementById('exportBtn').disabled = state.results.length === 0;

  if (state.targetUrls.length > 0) {
    document.getElementById('progressWrap').style.display = 'block';
    const pct = state.targetUrls.length === 0 ? 0 : Math.round((state.results.length / state.targetUrls.length) * 100);
    document.getElementById('progressText').innerText = `${state.results.length} / ${state.targetUrls.length} Processed`;
    document.getElementById('progressPercent').innerText = `${pct}%`;
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('fileDrop').style.display = 'none';
  } else {
    document.getElementById('progressWrap').style.display = 'none';
    document.getElementById('fileDrop').style.display = 'block';
  }

  document.getElementById('statLeads').innerText = state.results.length;
  document.getElementById('statValid').innerText = state.results.filter(r => r.emails.length > 0).length;

  const container = document.getElementById('resultsBody');
  container.innerHTML = '';

  state.results.slice().reverse().forEach(r => {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    let badgeHtml = '';
    if (r.technicalReason) {
      badgeHtml = `<span class="badge error">${r.technicalReason}</span>`;
    } else if (r.confidenceScore >= 50) {
      badgeHtml = `<span class="badge high-conf">${r.confidenceScore}% CONFIDENCE</span>`;
    } else {
      badgeHtml = `<span class="badge low-conf">${r.confidenceScore}% CONFIDENCE</span>`;
    }

    let proofHtml = '';
    if (r.screenshots && r.screenshots.length > 0) {
      proofHtml = `
      <div class="card-footer">
        <button class="view-proof-btn" data-img="${r.screenshots[0]}">View Forensic Proof</button>
      </div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="company-name">${r.name || r.url}</div>
          <a href="${r.url}" target="_blank" class="company-url">${r.url}</a>
        </div>
        <div class="card-badges">${badgeHtml}</div>
      </div>
      <div class="card-body">
        <div class="data-block">
          <span class="data-label">Best Contact</span>
          <span class="data-value">${r.bestEmail || 'None Found'}</span>
          ${r.emailType ? `<span class="email-type">${r.emailType}</span>` : ''}
        </div>
        <div class="data-block">
          <span class="data-label">Phone & LinkedIn</span>
          <span class="data-value">${r.phone || 'N/A'}</span>
          <span class="data-value" style="color:#0ea5e9; font-size:11px;">${r.bestLinkedIn || 'N/A'}</span>
        </div>
      </div>
      ${proofHtml}
    `;

    if (r.screenshots && r.screenshots.length > 0) {
      card.querySelector('.view-proof-btn').addEventListener('click', () => {
        document.getElementById('screenshotImage').src = r.screenshots[0];
        document.getElementById('screenshotModal').style.display = 'flex';
      });
    }

    container.appendChild(card);
  });
}

function exportToExcel() {
  const wb = XLSX.utils.book_new();

  // 1. Successful Leads
  const sheet1Data = state.results.filter(r => r.emails.length > 0).map(r => ({
    "Company Name": r.name,
    "Website": r.url,
    "Best Email": r.bestEmail,
    "Email Type": r.emailType,
    "Phone": r.phone,
    "Best LinkedIn": r.bestLinkedIn,
    "Confidence Score": r.confidenceScore + "%"
  }));
  const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, "Successful Leads");

  // 2. All Raw Data
  const sheet2Data = [];
  state.results.forEach(r => {
    r.emails.forEach(e => {
      sheet2Data.push({ "Company": r.name, "Type": "Email", "Value": e, "Source Page": r.url });
    });
    r.linkedinLinks.forEach(l => {
      sheet2Data.push({ "Company": r.name, "Type": "LinkedIn", "Value": l, "Source Page": r.url });
    });
    if (r.phone) {
      sheet2Data.push({ "Company": r.name, "Type": "Phone", "Value": r.phone, "Source Page": r.url });
    }
  });
  const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(wb, ws2, "All Raw Data");

  // 3. Technical Report
  const sheet3Data = state.results.filter(r => r.technicalReason !== '').map(r => ({
    "Website": r.url,
    "Error Type": r.technicalReason,
    "Emails Found": r.emails.length,
    "Action Required": "Manual Check Recommended"
  }));
  const ws3 = XLSX.utils.json_to_sheet(sheet3Data);
  XLSX.utils.book_append_sheet(wb, ws3, "Technical Report");

  XLSX.writeFile(wb, "LeadFlow_Elite_Report.xlsx");
}
