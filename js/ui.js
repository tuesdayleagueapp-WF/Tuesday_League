// js/ui.js
// Exports: escapeHtml, summarizeMatchScore, renderMatchList, renderMatrixRankings
// NOTE: cloned/pinned header logic removed for simplicity and reliability.

export function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function summarizeMatchScore(m) {
    if (!m) return null;
    const games = ['g1', 'g2', 'g3'];
    let leftWins = 0, rightWins = 0;
    const per = [];
    let any = false;

    for (const g of games) {
        const raw = m[g];
        if (!raw) { per.push(''); continue; }
        const parts = ('' + raw).match(/(\d+)\s*-\s*(\d+)/);
        if (!parts) { per.push(''); continue; }
        const a = parseInt(parts[1], 10);
        const b = parseInt(parts[2], 10);
        any = true;
        per.push(`${a}-${b}`);
        if (a > b) leftWins++; else if (b > a) rightWins++;
    }

    if (!any) return null;
    return { summary: `${leftWins}-${rightWins}`, detail: per.filter(Boolean).join(', ') };
}

export function renderMatchList(containerEl, matches, onSelect) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    if (!Array.isArray(matches) || matches.length === 0) {
        containerEl.innerHTML = '<div class="small">No matches scheduled.</div>';
        return;
    }

    // sort matches numerically by matchNumber if present
    const sorted = Array.from(matches).sort((a, b) => {
        const an = (a && a.matchNumber != null) ? Number(a.matchNumber) : Infinity;
        const bn = (b && b.matchNumber != null) ? Number(b.matchNumber) : Infinity;
        if (an !== bn) return an - bn;
        return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    const frag = document.createDocumentFragment();

    sorted.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = 'matchRow';
        row.tabIndex = 0;
        row.addEventListener('click', () => onSelect && onSelect(m));
        row.addEventListener('keypress', (e) => { if (e.key === 'Enter') onSelect && onSelect(m); });

        const scoreInfo = summarizeMatchScore(m);
        if (scoreInfo) row.classList.add('played');

        const pill = document.createElement('div');
        pill.className = 'matchPill';
        pill.innerHTML = scoreInfo
            ? `<span class="label-pill" style="background:#153b1f" title="${escapeHtml(scoreInfo.detail)}">${escapeHtml(scoreInfo.summary)}</span>`
            : `<span class="label-pill" style="background:#2b2f36">Pending</span>`;

        const matchNumberLabel = m.matchNumber ? `#${m.matchNumber}` : `#${idx + 1}`;

        const content = document.createElement('div');
        content.className = 'matchContent';
        content.innerHTML = `
      <div class="matchTopLeft">
        <div style="color:var(--muted);font-size:0.86rem;">Match ${escapeHtml(matchNumberLabel)}</div>
        <div class="matchSub">Umpire: ${escapeHtml(m.umpire || 'None')}</div>
      </div>
      <div class="matchTitle">${escapeHtml(m.name || 'Unknown')}</div>
      <div class="scoreLine">G1: ${escapeHtml(m.g1 || '-')} • G2: ${escapeHtml(m.g2 || '-')} • G3: ${escapeHtml(m.g3 || '-')}</div>
    `;

        row.appendChild(content);
        row.appendChild(pill);
        frag.appendChild(row);
    });

    containerEl.appendChild(frag);
}

/* Render matrix-style rankings into rankingsContainerEl.
   matches: array of match objects (with optional matchNumber and g1/g2/g3)
   players: array of player names (authoritative order)
*/
export function renderMatrixRankings(rankingsContainerEl, matches, players) {
    if (!rankingsContainerEl) {
        console.error('renderMatrixRankings: no container element provided');
        return;
    }

    if (!Array.isArray(matches) || matches.length === 0) {
        rankingsContainerEl.innerHTML = '<div class="small">No players found.</div>';
        return;
    }
    if (!Array.isArray(players) || players.length === 0) {
        rankingsContainerEl.innerHTML = '<div class="small">No player order provided.</div>';
        return;
    }

    // normalize helpers
    const _norm = (s) => {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim().replace(/\s+/g, ' ');
    };
    const _canon = (s) => {
        try { return _norm(String(s || '')).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
        catch (e) { return _norm(String(s || '')).toLowerCase(); }
    };

    // sort matches by numeric matchNumber (fallback insertion order)
    const matchesSorted = Array.from(matches).sort((a, b) => {
        const an = (a && a.matchNumber != null) ? Number(a.matchNumber) : Infinity;
        const bn = (b && b.matchNumber != null) ? Number(b.matchNumber) : Infinity;
        return an - bn;
    });

    // init stats
    const stats = {};
    players.forEach(p => { stats[p] = { name: p, MW: 0, GW: 0, GL: 0, perMatch: {} }; });

    const parseScorePair = (val) => {
        if (!val) return null;
        const parts = ('' + val).match(/(\d+)\s*-\s*(\d+)/);
        if (!parts) return null;
        return [parseInt(parts[1], 10), parseInt(parts[2], 10)];
    };

    // Compute per-match stats
    matchesSorted.forEach((m, matchIndex) => {
        const matchKey = (m && m.matchNumber != null) ? String(m.matchNumber) : String(matchIndex + 1);
        const parts = (m && m.name) ? m.name.split(/ vs /i).map(s => s && s.trim()).filter(Boolean) : [];
        const leftName = parts[0] || null;
        const rightName = parts[1] || null;

        const games = ['g1', 'g2', 'g3'];
        let leftGW = 0, rightGW = 0;
        let anyPlayed = false;
        const detailParts = [];
        games.forEach(g => {
            const pair = parseScorePair(m && m[g]);
            if (!pair) return;
            anyPlayed = true;
            detailParts.push(`${pair[0]}-${pair[1]}`);
            if (pair[0] > pair[1]) leftGW++; else if (pair[1] > pair[0]) rightGW++;
        });
        const detail = detailParts.join(', ');

        players.forEach(p => {
            stats[p].perMatch[matchKey] = null;
            if (!leftName || !rightName) return;

            const pIsLeft = _canon(leftName) === _canon(p);
            const pIsRight = _canon(rightName) === _canon(p);
            if (!pIsLeft && !pIsRight) return;

            const pGW = pIsLeft ? leftGW : rightGW;
            const oppGW = pIsLeft ? rightGW : leftGW;
            const win = anyPlayed ? (pGW > oppGW) : null;

            stats[p].perMatch[matchKey] = {
                played: anyPlayed,
                pGW,
                oppGW,
                win,
                detail,
                matchNumber: matchKey,
                opponent: pIsLeft ? rightName : leftName
            };

            if (anyPlayed) {
                if (pGW > oppGW) stats[p].MW++;
                stats[p].GW += pGW;
                stats[p].GL += oppGW;
            }
        });
    });

    const anyPlayed = matches.some(m => ['g1', 'g2', 'g3'].some(g => m[g] && String(m[g]).trim() !== ''));

    const list = anyPlayed
        ? Object.values(stats).sort((a, b) => {
            if (b.GW !== a.GW) return b.GW - a.GW;
            return 0;
        })
        : players.map(p => stats[p]);

    const maxMatchesPerPlayer = Math.max(1, players.length - 1);

    let html = '<table class="rank-grid"><thead><tr>';
    html += '<th class="center">Rank</th><th style="min-width:120px">Name</th>';
    for (let i = 1; i <= maxMatchesPerPlayer; i++) html += `<th class="center">Match ${i}</th>`;
    html += '<th class="center">MW</th><th class="center">Points</th>';
    html += '</tr></thead><tbody>';

    list.forEach((pObj, idx) => {
        const p = pObj.name;
        const rowClasses = (idx === 0) ? 'row-card top-rank' : 'row-card';
        html += `<tr class="${rowClasses}"><td class="center">${idx + 1}</td><td class="name-cell">${escapeHtml(p)}</td>`;

        const playerMatches = Object.values(pObj.perMatch || {})
            .filter(Boolean)
            .slice().sort((a, b) => {
                const an = (a && a.matchNumber != null) ? Number(a.matchNumber) : Infinity;
                const bn = (b && b.matchNumber != null) ? Number(b.matchNumber) : Infinity;
                return an - bn;
            });

        for (let i = 0; i < maxMatchesPerPlayer; i++) {
            const cell = playerMatches[i];
            if (!cell) {
                html += `<td class="center pill-none">-</td>`;
            } else {
                const matchLabel = `<div style="font-size:0.7rem; color:var(--muted); margin-bottom:2px;">Match ${escapeHtml(cell.matchNumber)}</div>`;
                if (!cell.played) {
                    html += `<td class="center">${matchLabel}<span class="pill-none">Pending<br><small>${escapeHtml(cell.opponent)}</small></span></td>`;
                } else {
                    const scoreText = `${cell.pGW}-${cell.oppGW}`;
                    const cls = (cell.win === true) ? 'played-cell played-win' : (cell.win === false) ? 'played-cell played-lose' : 'played-cell';
                    const mainHtml = `<div class="cell-main">${cell.win === true ? '<span class="pill-win">W ' + escapeHtml(scoreText) + '</span>' : cell.win === false ? '<span class="pill-lose">L ' + escapeHtml(scoreText) + '</span>' : escapeHtml(scoreText)}</div>`;
                    html += `<td class="center ${cls}">${matchLabel}${mainHtml}<div class="cell-detail">${escapeHtml(cell.detail)}<div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">${escapeHtml(cell.opponent)}</div></div></td>`;
                }
            }
        }

        html += `<td class="center">${pObj.MW || 0}</td><td class="center">${pObj.GW || 0}</td></tr>`;
    });

    html += '</tbody></table>';
    rankingsContainerEl.innerHTML = html;
}