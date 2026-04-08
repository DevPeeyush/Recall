/* ============================================================
   Recall — script.js  v3
   Splash → App, logo dropdown, tagline typewriter,
   image compression, background processing, search, trash
   ============================================================ */
'use strict';

/* ── Config ─────────────────────────────────────────────────
   Auto-detect backend URL:
   • Live Server (port 5500/5501) or file:// → FastAPI on :8000
   • Served by FastAPI itself → relative paths
   ─────────────────────────────────────────────────────────── */
const API_URL = (() => {
    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (protocol === 'file:') {
        return 'http://localhost:8000';
    }

    if (isLocalHost && port && port !== '8000') {
        return `http://${hostname}:8000`;
    }

    return '';
})();

const COMPRESS_MAX_W   = 1024;
const COMPRESS_QUALITY = 0.78;
const POLL_MS          = 3500;
const POLL_MAX         = 20;
const SPLASH_MS        = 2600;

/* ── State ── */
let pollTimer    = null;
let dropdownOpen = false;

/* ── Simple utils ── */
const UID    = () => localStorage.getItem('recall_uid');
const UEmail = () => localStorage.getItem('recall_email');

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openLightbox(url) { document.getElementById('fullImage').src = url; openModal('imageModal'); }

function toggleEmptyState(show) {
    document.getElementById('emptyState').style.display       = show ? 'flex' : 'none';
    document.getElementById('resultsContainer').style.display = show ? 'none' : 'grid';
}

function showStatus(msg, prog = false) {
    document.getElementById('loadingText').textContent          = msg;
    document.getElementById('progressContainer').style.display = prog ? 'block' : 'none';
    document.getElementById('loadingStatus').style.display     = 'flex';
}
function updateProgress(p) { document.getElementById('progressBar').style.width = Math.min(p, 100) + '%'; }
function hideStatus()       { document.getElementById('loadingStatus').style.display = 'none'; }

/* ════════════════════════════════════════════════
   SPLASH
   ════════════════════════════════════════════════ */
function initSplash() {
    const splash = document.getElementById('splashScreen');
    const app    = document.getElementById('appShell');

    setTimeout(() => {
        splash.classList.add('fade-out');
        setTimeout(() => {
            splash.style.display = 'none';
            app.className        = 'app-visible';
            initApp();
        }, 600);
    }, SPLASH_MS);
}

/* ════════════════════════════════════════════════
   APP INIT
   ════════════════════════════════════════════════ */
function initApp() {
    initTheme();
    initTagline();
    initDropdown();
    initAuth();
    initUpload();
    initSearch();
    initTrash();
}

/* ── Theme ── */
function initTheme() {
    applyTheme(localStorage.getItem('recall_theme') || 'dark');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('recall_theme', theme);

    // Sync top-right theme toggle icon
    const topIcon = document.getElementById('themeToggleIcon');
    if (topIcon) {
        topIcon.innerHTML = theme === 'dark'
            ? `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`
            : `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"/>`;
        topIcon.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }

    // Sync dropdown label/icon (kept for backwards compat if dropdown exists)
    const icon  = document.getElementById('dropdownThemeIcon');
    const label = document.getElementById('dropdownThemeLabel');
    if (icon && label) {
        if (theme === 'dark') {
            label.textContent = 'Light Mode';
            icon.innerHTML    = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
        } else {
            label.textContent = 'Dark Mode';
            icon.innerHTML    = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"/>`;
        }
    }
}

function toggleTheme() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ── Tagline Typewriter ── */
const TAGLINES = [
    '— Find what you forgot.',
    '— Nothing is lost.',
    '— It was always there.',
    '— Remember without trying.',
    '— Your memory, unlocked.',
    "— Because you've seen it before.",
    '— Bring it back.',
    '— From memory to moment.',
    '— See it again.',
    '— Just search.',
    '— Think less. Find more.',
];

function initTagline() {
    const el = document.getElementById('taglineText');
    let wi = 0, li = 0, dir = 1, waiting = false;

    setInterval(() => {
        if (waiting) return;
        const word = TAGLINES[wi];
        if (dir === 1) {
            li++;
            el.textContent = word.substring(0, li);
            if (li === word.length) {
                waiting = true;
                setTimeout(() => { dir = -1; waiting = false; }, 1500);
            }
        } else {
            li--;
            el.textContent = word.substring(0, li);
            if (li === 0) {
                waiting = true;
                setTimeout(() => { wi = (wi + 1) % TAGLINES.length; dir = 1; waiting = false; }, 400);
            }
        }
    }, 80);
}

/* ── Logo Dropdown ── */
function initDropdown() {
    const btn  = document.getElementById('logoBtn');
    const menu = document.getElementById('logoDropdown');

    btn.addEventListener('click', e => {
        e.stopPropagation();
        dropdownOpen = !dropdownOpen;
        menu.classList.toggle('open', dropdownOpen);
    });

    document.addEventListener('click', closeDropdown);
    menu.addEventListener('click', e => e.stopPropagation());
}

function closeDropdown() {
    dropdownOpen = false;
    document.getElementById('logoDropdown').classList.remove('open');
}

/* ── Auth ── */
function initAuth() {
    if (UID()) {
        setLoggedIn(UEmail());
        loadGallery();
    } else {
        setLoggedOut();
    }

    document.getElementById('signinForm').addEventListener('submit', doSignIn);
    document.getElementById('signupForm').addEventListener('submit', doSignUp);
    document.getElementById('forgotForm').addEventListener('submit', doForgot);
}

function setLoggedIn(email) {
    const u = document.getElementById('dropdownUser');
    u.style.display = 'flex';
    u.classList.add('show');
    document.getElementById('dropdownEmail').textContent  = email || '—';
    document.getElementById('dropdownAvatar').textContent = (email || 'R')[0].toUpperCase();
    document.getElementById('authOptions').style.display     = 'none';
    document.getElementById('loggedInOptions').style.display = 'block';
}

function setLoggedOut() {
    const u = document.getElementById('dropdownUser');
    u.style.display = 'none';
    u.classList.remove('show');
    document.getElementById('authOptions').style.display     = 'block';
    document.getElementById('loggedInOptions').style.display = 'none';
}

function openAuthTab(tab) { openModal('authModal'); switchTab(tab); }

function switchTab(tab) {
    ['signin', 'signup', 'forgot'].forEach(t => {
        document.getElementById(`panel-${t}`).style.display = t === tab ? 'block' : 'none';
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    });
}

async function doSignIn(e) {
    e.preventDefault();
    const email = document.getElementById('signinEmail').value.trim();
    const pass  = document.getElementById('signinPassword').value;
    const errEl = document.getElementById('signinError');
    const btn   = e.target.querySelector('button[type=submit]');
    errEl.textContent = '';
    btn.textContent = 'Signing in…';
    btn.disabled    = true;
    try {
        const res  = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('recall_uid',   data.user_id);
            localStorage.setItem('recall_email', data.email);
            setLoggedIn(data.email);
            closeModal('authModal');
            closeDropdown();
            loadGallery();
        } else {
            errEl.textContent = data.detail || 'Sign in failed.';
        }
    } catch {
        errEl.textContent = `Cannot reach server (${API_URL || 'localhost'}). Run: python backend/main.py`;
    } finally {
        btn.textContent = 'Sign In';
        btn.disabled    = false;
    }
}

async function doSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value.trim();
    const pass  = document.getElementById('signupPassword').value;
    const errEl = document.getElementById('signupError');
    const btn   = e.target.querySelector('button[type=submit]');
    errEl.textContent = '';
    btn.textContent = 'Creating…';
    btn.disabled    = true;
    try {
        const res  = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('recall_uid',   data.user_id);
            localStorage.setItem('recall_email', data.email);
            setLoggedIn(data.email);
            closeModal('authModal');
            closeDropdown();
            loadGallery();
        } else {
            errEl.textContent = data.detail || 'Sign up failed.';
        }
    } catch {
        errEl.textContent = `Cannot reach server. Run: python backend/main.py`;
    } finally {
        btn.textContent = 'Create Account';
        btn.disabled    = false;
    }
}

function doForgot(e) {
    e.preventDefault();
    document.getElementById('forgotError').textContent = '';
    alert('Password reset is not wired to the backend yet.\nContact your admin to reset your password.');
}

function logout() {
    if (!confirm('Log out of Recall?')) return;
    localStorage.removeItem('recall_uid');
    localStorage.removeItem('recall_email');
    setLoggedOut();
    document.getElementById('resultsContainer').innerHTML = '';
    toggleEmptyState(true);
    closeDropdown();
}

/* ════════════════════════════════════════════════
   GALLERY
   ════════════════════════════════════════════════ */
async function loadGallery() {
    showStatus('Loading gallery…');
    try {
        const res  = await fetch(`${API_URL}/gallery?user_id=${UID()}`);
        const data = await res.json();
        renderCards(data.results || []);
        if ((data.results || []).some(r => r.processing)) startPoll();
    } catch (err) {
        console.error('Gallery error:', err);
        toggleEmptyState(true);
    } finally {
        hideStatus();
    }
}

function startPoll() {
    if (pollTimer) return;
    let n = 0;
    pollTimer = setInterval(async () => {
        n++;
        try {
            const res  = await fetch(`${API_URL}/gallery?user_id=${UID()}`);
            const data = await res.json();
            renderCards(data.results || []);
            if (!(data.results || []).some(r => r.processing) || n >= POLL_MAX) {
                clearInterval(pollTimer); pollTimer = null;
            }
        } catch { /* silent */ }
    }, POLL_MS);
}

function renderCards(results) {
    const c = document.getElementById('resultsContainer');
    if (!results || !results.length) { toggleEmptyState(true); return; }
    toggleEmptyState(false);

    c.innerHTML = results.map(r => {
        const proc  = r.processing === true;
        const badge = r.text_score !== undefined
            ? `<span class="badge ${r.text_score > r.visual_score ? 'badge-text' : 'badge-visual'}">${r.text_score > r.visual_score ? 'OCR Match' : 'Visual Match'}</span>`
            : proc ? `<span class="badge badge-processing">⏳ Indexing…</span>`
                   : `<span class="badge badge-uploaded">Gallery</span>`;
        const conf = r.score !== undefined
            ? `<div class="score-row"><span>Confidence</span><strong>${(r.score*100).toFixed(1)}%</strong></div>` : '';
        const overlay = proc
            ? `<div class="card-processing-badge"><span class="mini-spinner"></span>Indexing…</div>` : '';

        return `
        <div class="card" id="card-${r.file_id}">
            ${overlay}
            <button class="btn-delete-card" onclick="deleteImage(event,'${r.file_id}')" title="Move to Trash">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
            <img src="${API_URL}${r.url}" alt="memory" loading="lazy"
                onclick="openLightbox('${API_URL}${r.url}')">
            <div class="card-body">
                ${badge}${conf}
                <div class="text-preview"><strong>Text:</strong> ${r.text_found || '<i>—</i>'}</div>
            </div>
        </div>`;
    }).join('');
}

/* ════════════════════════════════════════════════
   UPLOAD
   ════════════════════════════════════════════════ */
function initUpload() {
    document.getElementById('openAddBtn').addEventListener('click', () => openModal('addModal'));

    const zone = document.getElementById('dropZone');
    const inp  = document.getElementById('imageInput');

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleUpload(e.dataTransfer.files); });
    inp.addEventListener('change', e => handleUpload(e.target.files));
}

function compressImage(file) {
    return new Promise(resolve => {
        if (file.size < 150 * 1024) { resolve(file); return; }
        const img = new Image(), reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale  = Math.min(1, COMPRESS_MAX_W / img.width);
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
            }, 'image/jpeg', COMPRESS_QUALITY);
        };
        img.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

async function handleUpload(files) {
    if (!files || !files.length) return;
    closeModal('addModal');
    showStatus(`Compressing ${files.length} image(s)…`, true);
    updateProgress(0);

    const compressed = await Promise.all(Array.from(files).map(compressImage));

    const fd = new FormData();
    compressed.forEach(f => fd.append('files', f));
    fd.append('user_id', UID() || '');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/upload`, true);

    xhr.upload.onprogress = e => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        updateProgress(pct * 0.9);
        showStatus(pct < 100 ? `Uploading… ${pct}%` : 'Sent! AI indexing in background…', true);
    };

    xhr.onload = () => {
        updateProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
            try { showInstantCards(JSON.parse(xhr.responseText).results || []); } catch { /* */ }
            hideStatus();
            document.getElementById('imageInput').value = '';
            startPoll();
        } else {
            hideStatus();
            alert('Upload failed. Check server logs.');
        }
    };

    xhr.onerror = () => { hideStatus(); alert('Network error. Is the backend running?'); };
    xhr.send(fd);
}

function showInstantCards(results) {
    const c = document.getElementById('resultsContainer');
    toggleEmptyState(false);
    const frag = document.createDocumentFragment();
    results.forEach(r => {
        if (document.getElementById(`card-${r.file_id}`)) return;
        const div = document.createElement('div');
        div.className = 'card'; div.id = `card-${r.file_id}`;
        div.innerHTML = `
            <div class="card-processing-badge"><span class="mini-spinner"></span>Indexing…</div>
            <button class="btn-delete-card" onclick="deleteImage(event,'${r.file_id}')" title="Move to Trash">
                <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
            <img src="${API_URL}${r.url}" alt="new" loading="lazy" onclick="openLightbox('${API_URL}${r.url}')">
            <div class="card-body">
                <span class="badge badge-processing">⏳ Indexing…</span>
                <div class="text-preview"><i>Extracting text…</i></div>
            </div>`;
        frag.appendChild(div);
    });
    c.insertBefore(frag, c.firstChild);
}

/* ════════════════════════════════════════════════
   SEARCH
   ════════════════════════════════════════════════ */
function initSearch() {
    const inp = document.getElementById('searchInput');
    inp.addEventListener('input', e => { if (!e.target.value.trim()) loadGallery(); });

    document.getElementById('searchForm').addEventListener('submit', async e => {
        e.preventDefault();
        const q = inp.value.trim();
        if (!q) return loadGallery();
        showStatus('Searching…');
        try {
            const res  = await fetch(`${API_URL}/search?query=${encodeURIComponent(q)}&top_k=24&user_id=${UID()}`);
            const data = await res.json();
            const valid = (data.results || []).filter(r => r.text_score > r.visual_score || r.visual_score >= 0.23);
            renderCards(valid);
        } catch { toggleEmptyState(true); }
        finally { hideStatus(); }
    });
}

/* ════════════════════════════════════════════════
   TRASH
   ════════════════════════════════════════════════ */
function initTrash() {
    document.getElementById('openTrashBtn').addEventListener('click', () => { openModal('trashModal'); loadTrash(); });
}

async function deleteImage(event, fileId) {
    event.stopPropagation();
    try {
        const res = await fetch(`${API_URL}/trash/${fileId}`, { method: 'POST' });
        if (res.ok) {
            document.getElementById(`card-${fileId}`)?.remove();
            if (!document.getElementById('resultsContainer').children.length) toggleEmptyState(true);
        }
    } catch (err) { console.error(err); }
}

async function loadTrash() {
    const tc = document.querySelector('.trash-content');
    tc.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';
    try {
        const res  = await fetch(`${API_URL}/trash?user_id=${UID()}`);
        const data = await res.json();
        if (data.results && data.results.length) {
            tc.innerHTML = '<div class="trash-grid">' +
                data.results.map(i => `
                <div class="trash-item" id="trash-${i.file_id}">
                    <img src="${API_URL}${i.url}" alt="trashed">
                    <div class="trash-actions">
                        <button class="trash-btn" onclick="restoreImage('${i.file_id}')">Restore</button>
                        <button class="trash-btn" style="background:#ef4444;" onclick="permanentlyDeleteImage('${i.file_id}')">Delete</button>
                    </div>
                </div>`).join('') + '</div>';
        } else {
            tc.innerHTML = '<div style="font-size:38px;margin-bottom:10px;">🧹</div><p>Trash is empty</p>';
        }
    } catch { tc.innerHTML = '<p>Error loading trash</p>'; }
}

async function restoreImage(fileId) {
    try {
        const res = await fetch(`${API_URL}/restore/${fileId}`, { method: 'POST' });
        if (res.ok) {
            document.getElementById(`trash-${fileId}`)?.remove();
            loadGallery();
            if (!document.querySelector('.trash-content .trash-item')) loadTrash();
        }
    } catch (err) { console.error(err); }
}

async function permanentlyDeleteImage(fileId) {
    if (!confirm('Permanently delete this image?')) return;
    try {
        const res = await fetch(`${API_URL}/trash/delete/${fileId}`, { method: 'POST' });
        if (res.ok) {
            document.getElementById(`trash-${fileId}`)?.remove();
            if (!document.querySelector('.trash-content .trash-item')) loadTrash();
        }
    } catch (err) { console.error(err); }
}

async function emptyTrash() {
    if (!confirm('Permanently delete all trashed images? Cannot be undone.')) return;
    try { await fetch(`${API_URL}/empty-trash?user_id=${UID()}`, { method: 'POST' }); loadTrash(); }
    catch (err) { console.error(err); }
}

/* ════════════════════════════════════════════════
   CAMERA
   ════════════════════════════════════════════════ */
let cameraStream = null;

async function startCamera() {
    closeModal('addModal');
    openModal('cameraModal');
    const video = document.getElementById('cameraWebcam');
    video.style.display = 'block';
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = cameraStream;
    } catch { alert('Camera access denied or unavailable.'); closeCamera(); }
}

function closeCamera() {
    closeModal('cameraModal');
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
}

function capturePhoto() {
    const video  = document.getElementById('cameraWebcam');
    const canvas = document.getElementById('cameraCanvas');
    if (!cameraStream) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        closeCamera();
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const dt   = new DataTransfer(); dt.items.add(file);
        handleUpload(dt.files);
    }, 'image/jpeg', 0.9);
}

/* ════════════════════════════════════════════════
   GOOGLE DRIVE
   ════════════════════════════════════════════════ */
const DRIVE_CLIENT_ID = 'PLACEHOLDER_CLIENT_ID';
const DRIVE_APP_ID    = 'PLACEHOLDER_APP_ID';
const DRIVE_API_KEY   = 'PLACEHOLDER_API_KEY';
let driveToken = null;

function loadGooglePicker() {
    if (DRIVE_CLIENT_ID === 'PLACEHOLDER_CLIENT_ID') {
        alert('Google Drive needs credentials.\nReplace PLACEHOLDER values in script.js.');
        return;
    }
    showStatus('Loading Drive Picker…');
    const s    = document.createElement('script');
    s.src      = 'https://apis.google.com/js/api.js';
    s.onload   = () => {
        gapi.load('auth', { callbacks: { auth: () =>
            gapi.auth.authorize({ client_id: DRIVE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/drive.readonly', immediate: false }, res => {
                hideStatus();
                if (res && !res.error) { driveToken = res.access_token; createPicker(); }
                else alert('Drive authorization failed.');
            })
        }});
        gapi.load('picker', {});
    };
    document.body.appendChild(s);
}

function createPicker() {
    if (!driveToken) return;
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('image/png,image/jpeg,image/jpg,image/webp,image/gif');
    new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setAppId(DRIVE_APP_ID).setOAuthToken(driveToken)
        .addView(view).setDeveloperKey(DRIVE_API_KEY)
        .setCallback(pickerCallback).build().setVisible(true);
}

async function pickerCallback(data) {
    if (data.action !== google.picker.Action.PICKED) return;
    showStatus(`Downloading ${data.docs.length} file(s)…`, true);
    const dt = new DataTransfer();
    for (const doc of data.docs) {
        try {
            const r    = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
                { headers: { Authorization: 'Bearer ' + driveToken } });
            const blob = await r.blob();
            dt.items.add(new File([blob], doc.name, { type: doc.mimeType || 'image/jpeg' }));
        } catch { /* skip failed */ }
    }
    hideStatus();
    if (dt.files.length) handleUpload(dt.files);
    else alert('Failed to download from Drive.');
}

/* ════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', initSplash);
