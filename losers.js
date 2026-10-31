// GET /api/losers -> the worst 30-day traders on Hyperliquid (account value >= $50k)
// and "mark": the worst one that has an open perp position right now.
// Data: Hyperliquid's public leaderboard + info API. No keys. Cached 15 min at the edge.
const LB = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const INFO = 'https://api.hyperliquid.xyz/info';

const win = (row, k) => {
  const w = (row.windowPerformances || []).find((x) => x[0] === k);
  return w ? { pnl: +w[1].pnl || 0, roi: +w[1].roi || 0, vlm: +w[1].vlm || 0 } : { pnl: 0, roi: 0, vlm: 0 };
};

module.exports = async (req, res) => {
  try {
    const r = await fetch(LB, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('leaderboard ' + r.status);
    const d = await r.json();
    const rows = (d.leaderboardRows || [])
      .map((x) => ({ addr: String(x.ethAddress).toLowerCase(), av: +x.accountValue || 0, name: x.displayName || null, day: win(x, 'day'), week: win(x, 'week'), month: win(x, 'month'), all: win(x, 'allTime') }))
      .filter((x) => x.av >= 50000);
    rows.sort((a, b) => a.month.pnl - b.month.pnl);
    const worst = rows.slice(0, 10);
    // the mark: first of the worst with an open main-dex position
    let mark = null;
    for (const w of worst.slice(0, 8)) {
      try {
        const c = await fetch(INFO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: w.addr }) }).then((x) => x.json());
        const open = (c.assetPositions || []).filter((p) => +p.position.szi !== 0).length;
        w.open = open;
        if (open && !mark) mark = w.addr;
      } catch (e) { /* skip this one */ }
    }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ at: Date.now(), pool: rows.length, mark: mark || (worst[0] && worst[0].addr) || null, worst });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=60');
    res.status(502).json({ error: String(e.message || e) });
  }
};
