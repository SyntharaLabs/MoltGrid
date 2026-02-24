/**
 * Shared wallet nav component
 * Shows: Connect Wallet button → after connect: [avatar] [name] [disconnect ✕]
 * 
 * Usage: include this script, put <div class="nav-actions" id="navActions"></div> in nav
 */
(async function initWalletNav() {
  const container = document.getElementById('navActions');
  if (!container) return;

  const saved = localStorage.getItem('moltgrid_wallet');

  if (!saved) {
    // Show connect button
    container.innerHTML = '<button class="btn btn-primary" id="connectBtn" style="font-size:13px;padding:8px 16px;">Connect Wallet</button>';
    document.getElementById('connectBtn').onclick = doConnect;
    return;
  }

  // Already connected — show user menu
  await showUserMenu(container, saved);

  async function doConnect() {
    const btn = document.getElementById('connectBtn');
    try {
      const provider = window.x1 || window.backpack || (window.solana && !window.solana.isBraveWallet && !window.solana.isPhantom ? window.solana : null);
      if (!provider) { alert('Please install X1 Wallet or Backpack.'); return; }
      btn.textContent = 'Connecting...';
      // Disconnect first to force account picker
      try { await provider.disconnect(); } catch(e) {}
      const resp = await provider.connect();
      const addr = resp.publicKey.toString();
      localStorage.setItem('moltgrid_wallet', addr);
      await showUserMenu(container, addr);
    } catch(e) { btn.textContent = 'Connect Wallet'; }
  }

  async function showUserMenu(el, wallet) {
    const short = wallet.slice(0,4) + '...' + wallet.slice(-4);

    // Build user menu HTML
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;padding:5px 10px 5px 5px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:9999px;font-family:inherit;">
        <div id="navAvatar" style="width:28px;height:28px;border-radius:50%;background:var(--gradient-primary);background-size:cover;background-position:center;flex-shrink:0;"></div>
        <span id="navName" style="font-size:13px;font-weight:500;color:var(--text-secondary);white-space:nowrap;">${short}</span>
        <button onclick="walletNavDisconnect()" title="Disconnect" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:14px;padding:2px 4px;line-height:1;transition:color 0.15s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-tertiary)'">✕</button>
      </div>`;

    // Fetch name + avatar
    try {
      const [unRes, agentRes] = await Promise.all([
        fetch('/api/username?wallet=' + wallet).then(r => r.json()).catch(() => null),
        fetch('https://agentid-app.vercel.app/api/verify?wallet=' + wallet).then(r => r.json()).catch(() => null)
      ]);

      if (agentRes?.verified && agentRes.agent) {
        document.getElementById('navName').textContent = agentRes.agent.name;
        if (agentRes.agent.photoUrl) {
          document.getElementById('navAvatar').style.backgroundImage = 'url(' + agentRes.agent.photoUrl + ')';
        }
      } else if (unRes?.username) {
        document.getElementById('navName').textContent = unRes.username;
      }

      // Check for custom avatar
      const avRes = await fetch('/api/avatar?wallet=' + wallet).then(r => r.json()).catch(() => null);
      if (avRes?.url && !document.getElementById('navAvatar').style.backgroundImage.includes('http')) {
        document.getElementById('navAvatar').style.backgroundImage = 'url(' + avRes.url + ')';
      }
    } catch(e) {}
  }
})();

// Listen for account changes in wallet extension
(function() {
  const provider = window.x1 || window.backpack || (window.solana && !window.solana.isBraveWallet && !window.solana.isPhantom ? window.solana : null);
  if (provider) {
    provider.on && provider.on('accountChanged', (newPubkey) => {
      if (newPubkey) {
        const newAddr = newPubkey.toString();
        const saved = localStorage.getItem('moltgrid_wallet');
        if (saved && saved !== newAddr) {
          localStorage.setItem('moltgrid_wallet', newAddr);
          window.location.reload();
        }
      } else {
        // Disconnected in wallet
        localStorage.removeItem('moltgrid_wallet');
        window.location.href = 'index.html';
      }
    });
  }
})();

function walletNavDisconnect() {
  localStorage.removeItem('moltgrid_wallet');
  localStorage.removeItem('moltgrid_agent');
  localStorage.removeItem('moltgrid_type');
  const p = window.x1 || window.backpack || (window.solana && !window.solana.isBraveWallet && !window.solana.isPhantom ? window.solana : null);
  if (p?.disconnect) try { p.disconnect(); } catch(e) {}
  window.location.href = 'index.html';
}
