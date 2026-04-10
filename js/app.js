// js/app.js
// Main application logic for Tuesday_League
// - Handles fetching matches, rendering UI, score entry, and submission.
//
// Notes:
// - This file assumes index.html contains the new Games Selection markup
//   (.gamesRow with two .btn.toggle labels) and the Match Format radios.
// - If an older <select id="loginGamesSelect"> still exists we will fallback to it.

import { fetchMatches, submitScores } from './api.js';
import { renderMatchList, renderMatrixRankings, escapeHtml } from './ui.js';

/* Running Order Blueprints (Match Number -> [RankA, RankB]) */
const RUNNING_ORDER_MAPS = {
    4: { 1:[1,4], 2:[2,3], 3:[3,1], 4:[4,2], 5:[1,2], 6:[3,4] },
    5: { 1:[2,5], 2:[3,4], 3:[5,1], 4:[3,2], 5:[1,4], 6:[5,3], 7:[2,4], 8:[3,1], 9:[4,5], 10:[1,2] },
    6: { 1:[1,6], 2:[2,5], 3:[3,4], 4:[5,1], 5:[4,6], 6:[3,2], 7:[1,4], 8:[5,3], 9:[6,2], 10:[3,1], 11:[2,4], 12:[6,5], 13:[1,2], 14:[6,3], 15:[4,5] },
    7: { 1:[2,7], 2:[3,6], 3:[4,5], 4:[7,1], 5:[5,2], 6:[4,3], 7:[1,6], 8:[7,5], 9:[2,3], 10:[5,1], 11:[6,4], 12:[3,7], 13:[1,4], 14:[5,3], 15:[6,2], 16:[3,1], 17:[2,4], 18:[7,6], 19:[1,2], 20:[4,7], 21:[5,6] },
    8: { 1:[1,8], 2:[2,7], 3:[3,6], 4:[4,5], 5:[7,1], 6:[6,8], 7:[5,2], 8:[4,3], 9:[1,6], 10:[7,5], 11:[8,4], 12:[2,3], 13:[5,1], 14:[6,4], 15:[3,7], 16:[8,2], 17:[1,4], 18:[5,3], 19:[6,2], 20:[7,8], 21:[3,1], 22:[2,4], 23:[8,5], 24:[7,6], 25:[1,2], 26:[3,8], 27:[4,7], 28:[5,6] }
};

/**
 * Reconstruct authoritative player list (Rank 1..N) by checking match numbers
 * against the RUNNING_ORDER_MAPS blueprints.
 */
function reconstructAuthoritativePlayers(matches) {
    if (!matches || matches.length === 0) return [];

    // Collect unique player names
    const nameSet = new Set();
    matches.forEach(m => {
        const parts = (m.name || '').split(/ vs /i).map(s => s.trim()).filter(Boolean);
        parts.forEach(name => nameSet.add(name));
    });
    const playerCount = nameSet.size;

    // Find blueprint for the group size
    const blueprint = RUNNING_ORDER_MAPS[playerCount];
    if (!blueprint) {
        console.warn(`No blueprint found for ${playerCount} players. Falling back to first-seen.`);
        return Array.from(nameSet);
    }

    // Map ranks -> player names using match list and blueprint
    const rankMap = {};
    matches.forEach(m => {
        const mn = Number(m.matchNumber);
        const rankPair = blueprint[mn];
        if (!rankPair) return;

        const parts = (m.name || '').split(/ vs /i).map(s => s.trim()).filter(Boolean);
        if (parts.length < 2) return;

        if (!rankMap[rankPair[0]]) rankMap[rankPair[0]] = parts[0];
        if (!rankMap[rankPair[1]]) rankMap[rankPair[1]] = parts[1];
    });

    // Build ordered list Rank1..RankN
    const orderedList = [];
    for (let i = 1; i <= playerCount; i++) {
        if (rankMap[i]) orderedList.push(rankMap[i]);
    }
    return orderedList;
}

/* ============================
   App State
   ============================ */
let matchesCache = [];
let currentTable = '1';
let currentPassword = '';
let selectedMatch = null;
// Default to 2 games to match the new UI (Games Selection defaults to 2)
let selectedGamesCount = 2;
let selectedMode = 'sudden';
let playersFromT1 = [];

// Expose selection globally so other scripts can read it if needed
window.selectedGamesCount = selectedGamesCount;

/* ============================
   DOM references
   ============================ */
const loginSection = document.getElementById('loginSection');
const optionsSection = document.getElementById('optionsSection');
const scoreSection = document.getElementById('scoreSection');
const loginMsg = document.getElementById('loginMsg');
const matchList = document.getElementById('matchList');
const selectedMatchEl = document.getElementById('selectedMatch');
const gamesContainer = document.getElementById('gamesContainer');
const fixedSubmit = document.getElementById('fixedSubmit');
const modeBadge = document.getElementById('modeBadge');
const gamesBadge = document.getElementById('gamesBadge');
const passwordInput = document.getElementById('passwordInput');
const togglePassBtn = document.getElementById('togglePass');
const rankModal = document.getElementById('rankModalBackdrop');
const rankingsContainer = document.getElementById('rankingsContainer');

/* ============================
   Small UI helpers: hide/show
   ============================ */
function hideAll() {
    loginSection.style.display = 'none';
    optionsSection.style.display = 'none';
    scoreSection.style.display = 'none';
    fixedSubmit.style.display = 'none';
}
function showLogin() { hideAll(); loginSection.style.display = 'block'; loginMsg.textContent = 'Enter PIN then fetch'; }
function showOptions() { hideAll(); optionsSection.style.display = 'block'; updateBadges(); }
function showScore() { hideAll(); scoreSection.style.display = 'block'; fixedSubmit.style.display = 'block'; }

function updateBadges() {
    modeBadge.textContent = selectedMode === 'sudden' ? 'Sudden Death' : 'Normal';
    gamesBadge.textContent = selectedGamesCount + ' Games';
}

/* ============================
   Toggle password visibility
   ============================ */
togglePassBtn.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    togglePassBtn.textContent = type === 'password' ? '👁️' : '🙈';
});

/* ============================
   Score input sanitiser
   ============================ */
function onScoreInput(el) {
    el.value = el.value.replace(/\D/g, '');
    if (el.value.length > 2) el.value = el.value.slice(0, 2);
}

/* ============================
   Render match list (delegates to ui.js)
   ============================ */
function renderMatchesUI() {
    renderMatchList(matchList, matchesCache, selectMatch);
}

/* ============================
   Fetch matches and initial processing
   ============================ */
async function doFetchMatches(table, password) {
    loginMsg.textContent = 'Processing...';
    matchList.innerHTML = '<div class="small">Fetching list...</div>';
    try {
        const matches = await fetchMatches(table, password);
        matchesCache = Array.isArray(matches) ? matches.slice() : [];
        window.matchesCache = matchesCache; // TEMP expose for debugging

        // Build authoritative playersFromT1 from the fetched matches (best-effort)
        try {
            playersFromT1 = reconstructAuthoritativePlayers(matchesCache || []);
        } catch (err) {
            console.warn('Failed to build playersFromT1:', err);
            playersFromT1 = [];
        }

        // Sort matches by numeric matchNumber, fallback to name
        matchesCache.sort((a, b) => {
            const an = (a && a.matchNumber !== undefined && a.matchNumber !== null) ? Number(a.matchNumber) : Infinity;
            const bn = (b && b.matchNumber !== undefined && b.matchNumber !== null) ? Number(b.matchNumber) : Infinity;
            if (an !== bn) return an - bn;
            const aname = (a && a.name) ? a.name : '';
            const bname = (b && b.name) ? b.name : '';
            return aname.localeCompare(bname, undefined, { sensitivity: 'base' });
        });

        renderMatchesUI();
        loginMsg.textContent = 'Connected — ' + matchesCache.length + ' matches';
        showOptions();
    } catch (err) {
        console.error(err);
        loginMsg.textContent = 'Error: ' + (err.message || 'Failed to fetch');
        matchList.innerHTML = '<div class="small">Error fetching matches.</div>';
    }
}

/* ============================
   When user selects a match
   - Renders score inputs according to selectedGamesCount
   ============================ */
function selectMatch(match) {
    selectedMatch = match;
    const umpireName = match.umpire || "None";
    selectedMatchEl.innerHTML = `<div style="color:var(--accent);font-weight:700">Umpire: ${escapeHtml(umpireName)}</div><div style="margin-top:6px">${escapeHtml(match.name)}</div>`;

    let p1 = "Player 1", p2 = "Player 2";
    if (match.name && / vs /i.test(match.name)) {
        const parts = match.name.split(/ vs /i);
        p1 = parts[0].trim();
        p2 = parts[1].trim();
    }

    // Build the games input rows dynamically based on currently selected games
    gamesContainer.innerHTML = '';
    for (let g = 1; g <= selectedGamesCount; g++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gameRow';
        wrapper.innerHTML = `
      <div class="gameLabel">G${g}</div>
      <input type="number" id="p1g${g}" placeholder="${escapeHtml(p1)}" min="0" max="99" inputmode="numeric">
      <div style="width:12px;text-align:center;color:var(--muted)">-</div>
      <input type="number" id="p2g${g}" placeholder="${escapeHtml(p2)}" min="0" max="99" inputmode="numeric">
    `;
        const key = 'g' + g;
        if (match[key]) {
            const parts = (match[key] || '').toString().split('-');
            if (parts.length >= 2) {
                const a = parts[0].replace(/[^\d]/g, '');
                const b = parts[1].replace(/[^\d]/g, '');
                wrapper.querySelector(`#p1g${g}`).value = a;
                wrapper.querySelector(`#p2g${g}`).value = b;
            }
        }
        wrapper.querySelectorAll('input').forEach(inp => inp.addEventListener('input', (e) => onScoreInput(e.target)));
        gamesContainer.appendChild(wrapper);
    }
    document.getElementById('submitMsg').textContent = '';
    showScore();
}

/* ============================
   Collect & format scores from inputs
   ============================ */
function collectScores() {
    const obj = {};
    for (let g = 1; g <= selectedGamesCount; g++) {
        const aEl = document.getElementById(`p1g${g}`);
        const bEl = document.getElementById(`p2g${g}`);
        const a = aEl ? (aEl.value || '').trim() : '';
        const b = bEl ? (bEl.value || '').trim() : '';
        if (a === '' && b === '') obj['g' + g] = '';
        else obj['g' + g] = `${a}-${b}`;
    }
    return obj;
}

/* ============================
   Score validation logic
   - Ensures numeric ranges, winner rules for sudden/normal mode, etc.
   ============================ */
function scoreCheck(scoresObj) {
    const mode = selectedMode;
    let anyEntered = false;
    const errs = [];

    for (let idx = 0; idx < selectedGamesCount; idx++) {
        const k = 'g' + (idx + 1);
        const val = (scoresObj[k] || '').trim();
        if (!val) continue;
        anyEntered = true;

        const parts = val.split('-').map(s => s.replace(/[^\d]/g, ''));
        const leftRaw = parts[0] || '';
        const rightRaw = parts[1] || '';

        if (leftRaw === '' || rightRaw === '') {
            errs.push(`Game ${idx + 1} has an invalid score.`);
            continue;
        }

        const a = parseInt(leftRaw, 10), b = parseInt(rightRaw, 10);
        if (isNaN(a) || isNaN(b)) { errs.push(`Game ${idx + 1} must be numeric.`); continue; }
        if (a < 0 || b < 0 || a > 99 || b > 99) { errs.push(`Game ${idx + 1} scores must be 0–99.`); continue; }
        if (a === b) { errs.push(`Game ${idx + 1} cannot be a draw.`); continue; }

        const winnerScore = Math.max(a, b);
        const loserScore = Math.min(a, b);

        if (mode === 'sudden') {
            if (winnerScore !== 11) { errs.push(`Game ${idx + 1}: in Sudden Death the winner must reach 11 (e.g. 11-9).`); continue; }
            if (loserScore > 10) { errs.push(`Game ${idx + 1}: invalid — losing score must be 0–10 in Sudden Death.`); continue; }
        } else {
            if (winnerScore < 11) { errs.push(`Game ${idx + 1}: winner must reach at least 11 in Normal mode.`); continue; }
            if (a >= 10 && b >= 10) {
                if ((winnerScore - loserScore) < 2) { errs.push(`Game ${idx + 1}: at deuce (10+), winner must be 2 points ahead in Normal mode.`); continue; }
            }
        }
    }

    if (!anyEntered) errs.push('Enter at least one game score before submitting.');
    return { ok: errs.length === 0, errors: errs, anyEntered };
}

/* ============================
   Submit scores to backend
   - Uses submitScores from api.js
   - Merges returned object into matchesCache and updates UI
   ============================ */
async function submitScoresHandler() {
    if (!selectedMatch) { alert('No match selected'); return; }
    const opponents = selectedMatch.name;
    const s = collectScores();
    const check = scoreCheck(s);
    if (!check.ok) {
        document.getElementById('submitMsg').textContent = 'Error: ' + check.errors.join(' | ');
        return;
    }

    const params = {
        action: 'submit',
        table: currentTable,
        password: currentPassword,
        opponents: opponents,
        ...s
    };

    document.getElementById('submitMsg').textContent = 'Submitting...';
    fixedSubmit.disabled = true;
    fixedSubmit.textContent = 'SENDING...';

    try {
        const obj = await submitScores(params);
        fixedSubmit.disabled = false;
        fixedSubmit.textContent = 'SUBMIT SCORES';
        console.log('submit response:', obj);
        console.log('submitted payload:', s);
        console.log('selectedMatch before:', JSON.parse(JSON.stringify(selectedMatch)));

        if (!(obj && obj.status === 'success')) {
            const msg = obj && obj.message ? obj.message : 'Save failed';
            document.getElementById('submitMsg').textContent = 'Error: ' + msg;
            return;
        }

        // Accept a few common shapes for returned match object
        let returnedMatch = null;
        if (obj.updatedMatch) returnedMatch = obj.updatedMatch;
        else if (obj.match) returnedMatch = obj.match;
        else if (obj.data && obj.data.match) returnedMatch = obj.data.match;
        else if (obj.data && obj.data.updatedMatch) returnedMatch = obj.data.updatedMatch;

        if (returnedMatch) {
            // ensure keys exist as strings
            ['g1', 'g2', 'g3'].forEach(k => { if (returnedMatch[k] === undefined || returnedMatch[k] === null) returnedMatch[k] = ''; });
            selectedMatch = returnedMatch;
        } else {
            // Merge submitted non-empty fields into selectedMatch
            ['g1', 'g2', 'g3'].forEach(k => {
                if (s[k] !== undefined && s[k] !== '') selectedMatch[k] = ('' + s[k]).trim();
            });
        }

        // Update matchesCache by id or name
        const matchIdentifier = (m) => (m && m.id) ? ('id:' + m.id) : ('name:' + (m.name || '').trim().toLowerCase());
        const selKey = matchIdentifier(selectedMatch);
        let replaced = false;
        for (let i = 0; i < matchesCache.length; i++) {
            if (matchIdentifier(matchesCache[i]) === selKey) {
                matchesCache[i] = JSON.parse(JSON.stringify(selectedMatch));
                replaced = true;
                break;
            }
        }
        if (!replaced) {
            // fallback: try to update by exact name match
            const idx = matchesCache.findIndex(m => (m.name || '').trim().toLowerCase() === (selectedMatch.name || '').trim().toLowerCase());
            if (idx !== -1) { matchesCache[idx] = JSON.parse(JSON.stringify(selectedMatch)); replaced = true; }
        }

        // Build "after" values from selectedMatch for checking completeness
        const afterValues = {};
        for (let g = 1; g <= selectedGamesCount; g++) {
            const k = 'g' + g;
            afterValues[k] = (selectedMatch[k] !== undefined && selectedMatch[k] !== null) ? ('' + selectedMatch[k]).trim() : '';
        }

        // Strict game-filled test (e.g. "11-9")
        const gameFilled = (val) => {
            if (!val) return false;
            return /^\s*\d{1,2}\s*-\s*\d{1,2}\s*$/.test(val.toString());
        };

        const allEnteredMerged = (function () {
            for (let g = 1; g <= selectedGamesCount; g++) {
                if (!gameFilled(afterValues['g' + g])) return false;
            }
            return true;
        })();

        // Also accept a server-side completion flag if present
        const serverComplete = obj && (obj.complete === true || obj.all_entered === true);

        console.log('afterValues:', afterValues, 'allEnteredMerged:', allEnteredMerged, 'serverComplete:', serverComplete);

        // Re-render the match list to show updated scores immediately
        renderMatchesUI();

        if (serverComplete || allEnteredMerged) {
            document.getElementById('submitMsg').textContent = 'Saved — all games complete. Returning to match list...';
            setTimeout(() => { selectedMatch = null; renderMatchesUI(); showOptions(); }, 600);
        } else {
            document.getElementById('submitMsg').textContent = 'Saved — partial scores remain. You can continue editing.';
            // update the UI inputs to reflect the merged/returned values
            for (let g = 1; g <= selectedGamesCount; g++) {
                const aEl = document.getElementById(`p1g${g}`);
                const bEl = document.getElementById(`p2g${g}`);
                const val = afterValues['g' + g];
                if (val && /^\s*\d{1,2}\s*-\s*\d{1,2}\s*$/.test(val)) {
                    const parts = val.split('-').map(x => x.replace(/[^\d]/g, ''));
                    if (aEl) aEl.value = parts[0] || '';
                    if (bEl) bEl.value = parts[1] || '';
                }
            }
        }

        console.log('selectedMatch after update:', JSON.parse(JSON.stringify(selectedMatch)));
    } catch (err) {
        console.error('submit err', err);
        fixedSubmit.disabled = false;
        fixedSubmit.textContent = 'SUBMIT SCORES';
        document.getElementById('submitMsg').textContent = 'Network error while submitting.';
    }
}

/* ============================
   UI wiring - button listeners
   ============================ */

// LOGIN button: read current table, password, games count and mode, then fetch matches.
// - Uses the new games selection (window.selectedGamesCount) by default.
// - Falls back to an older select with id="loginGamesSelect" if still present.
document.getElementById('loginBtn').addEventListener('click', () => {
    currentTable = document.getElementById('tableSelect').value;
    currentPassword = document.getElementById('passwordInput').value;

    // if older select exists, read it; otherwise use games toggle state
    const loginGamesSelectEl = document.getElementById('loginGamesSelect');
    if (loginGamesSelectEl) {
        selectedGamesCount = parseInt(loginGamesSelectEl.value, 10) || selectedGamesCount;
    } else {
        selectedGamesCount = window.selectedGamesCount || selectedGamesCount;
    }

    const modeEl = document.querySelector('input[name="mode"]:checked');
    selectedMode = (modeEl && modeEl.value) ? modeEl.value : selectedMode;

    updateBadges();
    loginMsg.textContent = 'Connecting...';
    doFetchMatches(currentTable, currentPassword);
});

// Other controls
document.getElementById('refreshBtn').addEventListener('click', () => doFetchMatches(currentTable, currentPassword));
document.getElementById('logoutBtn').addEventListener('click', () => { currentPassword = ''; matchesCache = []; selectedMatch = null; showLogin(); });
document.getElementById('backToLoginBtn').addEventListener('click', () => { showLogin(); });
document.getElementById('backToMatchesBtn').addEventListener('click', () => { selectedMatch = null; renderMatchesUI(); showOptions(); });

// Rankings modal handlers
function openRankings() {
    const authoritativePlayers = (Array.isArray(playersFromT1) && playersFromT1.length > 0)
        ? playersFromT1
        : reconstructAuthoritativePlayers(matchesCache || []);
    renderMatrixRankings(rankingsContainer, matchesCache || [], authoritativePlayers);
    rankModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
document.getElementById('rankBtnLogin').addEventListener('click', openRankings);
document.getElementById('rankBtnList').addEventListener('click', openRankings);

// close when clicking backdrop
rankModal.addEventListener('click', (e) => {
    if (e.target === rankModal) {
        rankModal.style.display = 'none';
        document.body.style.overflow = '';
    }
});
// close when clicking the Close button inside the Rankings modal
const closeRankBtn = document.getElementById('closeRank');
if (closeRankBtn) closeRankBtn.addEventListener('click', () => { rankModal.style.display = 'none'; document.body.style.overflow = ''; });

// Submit scores button
fixedSubmit.addEventListener('click', submitScoresHandler);

// expose the onScoreInput helper for debugging or external use
window.onScoreInput = onScoreInput;

/* ============================
   NEW: Games toggle wiring
   - Hooks the two toggle labels in .gamesRow so they behave like buttons.
   - Updates selectedGamesCount (global) and the visible games badge.
   ============================ */
function initGamesToggle() {
    const buttons = document.querySelectorAll('.gamesRow .btn.toggle');
    if (!buttons || buttons.length === 0) return;

    // Internal helper to set selection visually + state
    function selectGames(val) {
        buttons.forEach(b => b.classList.remove('selected'));
        const btn = document.querySelector('.gamesRow .btn.toggle[data-games="' + val + '"]');
        if (btn) btn.classList.add('selected');

        // update the hidden radio (if present) — keeps compatibility with code that reads radios
        const input = btn ? btn.querySelector('input[type="radio"]') : null;
        if (input) input.checked = true;

        // update app state (both local var and global window var)
        selectedGamesCount = parseInt(val, 10);
        window.selectedGamesCount = selectedGamesCount;

        // update the visible badge on the match list/header
        if (gamesBadge) gamesBadge.textContent = selectedGamesCount + ' Games';
    }

    // Attach click handlers
    buttons.forEach(btn => {
        btn.addEventListener('click', function () {
            const val = btn.getAttribute('data-games');
            if (!val) return;
            selectGames(val);
        });
    });

    // Apply default selection on init
    selectGames(window.selectedGamesCount || selectedGamesCount);
}

/* ============================
   NEW: Keep mode badge in-sync with selected radio
   - Updates #modeBadge whenever the radio changes.
   ============================ */
function initModeBadgeUpdate() {
    const radios = document.querySelectorAll('.radioRow input[type="radio"][name="mode"]');
    const badge = document.getElementById('modeBadge');
    if (!radios || radios.length === 0 || !badge) return;

    function updateModeBadge() {
        const checked = document.querySelector('.radioRow input[type="radio"][name="mode"]:checked');
        if (checked) {
            const modeText = (checked.value === 'normal') ? 'Normal' : 'Sudden Death';
            badge.textContent = modeText;
            // also update internal selectedMode so it stays current if changed outside login
            selectedMode = checked.value;
        }
    }

    radios.forEach(r => r.addEventListener('change', updateModeBadge));
    updateModeBadge();
}

/* ============================
   Initialize UI wiring after DOM ready
   ============================ */
function initAll() {
    // Ensure the games toggle + mode badge are wired
    initGamesToggle();
    initModeBadgeUpdate();

    // Reflect initial badges
    updateBadges();

    // Show login by default
    showLogin();
}

// Run initialization depending on DOM readiness. The script is loaded with `defer` and `type="module"`,
 // but this check is robust for any loading mode.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}