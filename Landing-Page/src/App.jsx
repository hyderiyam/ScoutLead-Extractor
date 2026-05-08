import React from 'react';

function App() {
  return (
    <>
      <nav className="navbar">
        <div className="logo">
          LeadFlow<span>ELITE</span>
        </div>
        <button className="nav-btn" onClick={() => alert('Install Extension directly from the Chrome Web Store!')}>
          Add to Chrome — Free
        </button>
      </nav>

      <main className="hero">
        <div className="badge">✨ Introducing the Next Generation of Lead Scraping</div>
        <h1 className="title">
          Unleash the Power of<br/>
          <span>AI Lead Intelligence.</span>
        </h1>
        <p className="subtitle">
          Extract verified emails, phone numbers, and decision-maker profiles directly from any website. Zero backend costs, full forensic proof, and automated 3-sheet Excel reporting.
        </p>
        
        <div className="cta-group">
          <a href="#" className="cta-primary" onClick={(e) => { e.preventDefault(); alert('Redirecting to Chrome Web Store...'); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Add to Chrome Now
          </a>
          <a href="#features" className="cta-secondary">
            Discover Features
          </a>
        </div>

        <div className="dashboard-preview">
          <div className="dashboard-mockup">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1" style={{marginRight: 10}}>
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Chrome Extension UI Preview
          </div>
        </div>
      </main>

      <section id="features" className="features">
        <div className="features-grid">
          
          <div className="feature-card">
            <div className="feature-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <h3 className="feature-title">3-Sheet Excel Export</h3>
            <p className="feature-desc">
              Automatically generate enterprise-grade reports featuring <strong>Successful Leads</strong>, raw data transparency, and a detailed technical failure log so you never miss a beat.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>
            <h3 className="feature-title">Forensic Proof</h3>
            <p className="feature-desc">
              Build absolute trust with your clients. Our engine highlights extracted data directly on the page and captures high-definition screenshot proof of every lead discovered.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h3 className="feature-title">100% Local & Secure</h3>
            <p className="feature-desc">
              Run everything safely inside your browser. No databases, no external APIs, and absolutely zero monthly server costs. Your data never leaves your machine.
            </p>
          </div>

        </div>
      </section>

      <footer className="footer">
        &copy; {new Date().getFullYear()} LeadFlow ELITE. Crafted with precision.
      </footer>
    </>
  );
}

export default App;
