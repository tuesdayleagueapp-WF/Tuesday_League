/* API module — configured with your Apps Script endpoint */
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAoUK7xQuZTDz8S_yzcFLPgeuMhSgry9HgD7IqnYYblBl6_OiS1Wz_-gZqTblUyoRa2w/exec';

/**
 * Fetch matches for a table/password
 * returns matches array or throws
 */
export async function fetchMatches(table, password) {
    const url = `${SCRIPT_URL}?table=${encodeURIComponent(table)}&password=${encodeURIComponent(password)}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Network response was not ok (${res.status})`);
    const json = await res.json();

window.lastFetchMatchesResponse = json;
console.log('fetchMatches: server response saved to window.lastFetchMatchesResponse');

    if (!json || json.status !== 'success') {
        const msg = json && json.message ? json.message : 'Failed to fetch matches';
        throw new Error(msg);
    }
    return json.matches;
}

/**
 * Submit scores: params is object containing { action:'submit', table, password, opponents, g1, g2, g3 }
 * returns server response object
 */
export async function submitScores(params) {
    const url = `${SCRIPT_URL}?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Network response was not ok (${res.status})`);
    return res.json();
}