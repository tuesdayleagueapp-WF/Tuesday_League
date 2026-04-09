# Tuesday_League (Web)

Non-Unity web version of the Tuesday League match scoring + rankings UI.

Structure:
- index.html — entry page
- css/styles.css — styles (contains restored gradient/card visuals)
- js/api.js — network functions (configure SCRIPT_URL)
- js/ui.js — rendering helpers
- js/app.js — app bootstrap and state management
- extras/sample-data.json — optional local test data

Local testing:
1. Open a terminal in the project root.
2. Run a simple static server:
   - Python 3: `python -m http.server 8000`
3. Open http://localhost:8000

Deployment (GitHub Pages):
1. Commit and push repo to GitHub.
2. Settings → Pages: use `main` branch and root `/ (root)`.

Notes:
- Update `js/api.js` constant `SCRIPT_URL` with your Apps Script or backend endpoint.
- Defaults: Table 1 and Sudden Death (11-point) mode.