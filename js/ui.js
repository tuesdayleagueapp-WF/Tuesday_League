/* js/ui.js - FINAL STABLE VERSION WITH DARK RED AND DRAW FIXES */

export function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function summarizeMatchScore(m) {
    const games = ['g1', 'g2', 'g3'];
    let leftWins = 0, rightWins = 0;
    const per = [];
    let any = false;
    for (let g of games) {
        if (!m[g]) continue;
        const parts = m[g].toString().split('-').map(s => parseInt(s.replace(/[^\d]/g, '')));
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;
        any = true;
        per.push(parts[0] + '-' + parts[1]);
        if (parts[0] > parts[1]) leftWins++; else if (parts[1] > parts[0]) rightWins++;
    }
    if (!any) return null;
    return { summary: `${leftWins}-${rightWins}`, detail: per.join(', '), left: leftWins, right: rightWins };
}

/* Color Map and Pill Helper */
function makePillHtml(label, cls = 'pill-none', title = '') {
    const map = {
        'pill-win': { bg: '#1e8e3f', fg: '#ffffff' },  // Green
        'pill-lose': { bg: '#980905', fg: '#ffffff' }, // YOUR DARK RED
        'pill-draw': { bg: '#d2a03a', fg: '#111111' }, // Gold Draw
        'pill-none': { bg: '#2b2f36', fg: '#ffffff' }  // Pending Grey
    };
    const c = map[cls] || map['pill-none'];
    return `<span class="label-pill" title="${escapeHtml(title)}" style="background-color:${c.bg} !important; color:${c.fg} !important; border-radius:4px; padding:2px 8px; font-weight:700;">${escapeHtml(label)}</span>`;
}

export function renderMatchList(containerEl, matches, onSelect) {
    containerEl.innerHTML = '';
    const sorted = Array.from(matches || []).sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));

    sorted.forEach((m, idx) => {
        const row = document.createElement('div');
        row.className = 'matchRow';
        row.onclick = () => onSelect && onSelect(m);

        const scoreInfo = summarizeMatchScore(m);
        let pillHtml;
        if (scoreInfo) {
            row.classList.add('played');
            let cls = 'pill-draw', letter = 'D';
            if (scoreInfo.left > scoreInfo.right) { cls = 'pill-win'; letter = 'W'; }
            else if (scoreInfo.right > scoreInfo.left) { cls = 'pill-lose'; letter = 'L'; }
            pillHtml = makePillHtml(`${letter} ${scoreInfo.summary}`, cls, scoreInfo.detail);
        } else {
            pillHtml = makePillHtml('Pending', 'pill-none');
        }

        const selectedCount = Number(window.selectedGamesCount) || 3;
        let scoreLine = [];
        for (let i = 1; i <= selectedCount; i++) scoreLine.push(`G${i}: ${escapeHtml(m['g' + i] || '-')}`);

        row.innerHTML = `
            <div class="matchContent">
                <div class="matchTopLeft">
                    <div style="color:var(--muted);font-size:0.86rem;">Match #${m.matchNumber || idx + 1}</div>
                    <div class="matchSub">Umpire: ${escapeHtml(m.umpire || 'None')}</div>
                </div>
                <div class="matchTitle">${escapeHtml(m.name || 'Unknown')}</div>
                <div class="scoreLine">${scoreLine.join(' • ')}</div>
            </div>
            <div class="matchPill">${pillHtml}</div>
        `;
        containerEl.appendChild(row);
    });
}

export function renderMatrixRankings(containerEl, matches, players) {
    if (!containerEl) return;
    const stats = {};
    players.forEach(p => { stats[p] = { name: p, MW: 0, GW: 0, perMatch: {} }; });

    matches.forEach((m, idx) => {
        const mKey = m.matchNumber || (idx + 1);
        const pNames = (m.name || '').split(/ vs /i).map(s => s.trim());
        const leftP = pNames[0], rightP = pNames[1];

        let lGW = 0, rGW = 0, played = false;
        ['g1', 'g2', 'g3'].forEach(g => {
            const pair = (m[g] || '').split('-').map(s => parseInt(s.replace(/[^\d]/g, '')));
            if (pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1])) {
                played = true;
                if (pair[0] > pair[1]) lGW++; else if (pair[1] > pair[0]) rGW++;
            }
        });

        players.forEach(p => {
            if (p !== leftP && p !== rightP) return;
            const isL = p === leftP;
            const myGW = isL ? lGW : rGW;
            const oppGW = isL ? rGW : lGW;
            stats[p].perMatch[mKey] = { played, myGW, oppGW, opp: isL ? rightP : leftP };
            if (played) {
                if (myGW > oppGW) stats[p].MW++;
                stats[p].GW += myGW;
            }
        });
    });

    const sorted = Object.values(stats).sort((a, b) => b.GW - a.GW);
    const maxCols = players.length - 1;

    let html = '<table class="rank-grid"><thead><tr><th class="center">Rank</th><th>Name</th>';
    for (let i = 1; i <= maxCols; i++) html += `<th class="center">Match ${i}</th>`;
    html += '<th class="center">MW</th><th class="center">Points</th></tr></thead><tbody>';

    sorted.forEach((p, idx) => {
        html += `<tr class="row-card ${idx === 0 ? 'top-rank' : ''}"><td class="center">${idx + 1}</td><td class="name-cell">${escapeHtml(p.name)}</td>`;
        const pMatches = Object.entries(p.perMatch).sort((a, b) => Number(a[0]) - Number(b[0]));
        for (let i = 0; i < maxCols; i++) {
            const mData = pMatches[i] ? pMatches[i][1] : null;
            if (!mData) html += `<td class="center">-</td>`;
            else if (!mData.played) html += `<td class="center">${makePillHtml('Pending', 'pill-none', mData.opp)}</td>`;
            else {
                let cls = 'pill-draw', letter = 'D';
                if (mData.myGW > mData.oppGW) { cls = 'pill-win'; letter = 'W'; }
                else if (mData.oppGW > mData.myGW) { cls = 'pill-lose'; letter = 'L'; }
                html += `<td class="center">${makePillHtml(`${letter} ${mData.myGW}-${mData.oppGW}`, cls, mData.opp)}</td>`;
            }
        }
        html += `<td class="center">${p.MW}</td><td class="center">${p.GW}</td></tr>`;
    });
    containerEl.innerHTML = html + '</tbody></table>';
}