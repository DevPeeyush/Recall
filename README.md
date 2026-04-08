# Recall
# 🔍 Recall — Intelligent Image Search

An AI-powered image memory app. Upload images and search them visually or by text (OCR).

---

## 📁 Project Structure

```
recall/
│
├── frontend/
│   ├── index.html      ← Clean HTML shell (no inline styles/scripts)
│   ├── style.css       ← All styles + responsive media queries
│   └── script.js       ← All JS logic (compression, upload, search, camera)
│
├── backend/
│   ├── main.py         ← FastAPI server (serves frontend + API)
│   └── requirements.txt
│
├── Dockerfile          ← Single container build
├── docker-compose.yml  ← Easy local run
└── README.md
```

---

## ⚡ Key Optimizations (vs original)

### Frontend
| Issue | Fix |
|---|---|
| No media queries → broken on mobile | Full responsive CSS with `@media` breakpoints |
| Fixed px padding on mobile | Adaptive padding at 768px and 420px |
| Images uploaded at full size (3–10 MB) | **Client-side compression** to ~1024px JPEG before upload |
| User waits for AI to finish | **Instant card display** after upload; AI badges update in background |
| Search bar overflow on mobile | Full-width search bar on small screens |

### Backend
| Issue | Fix |
|---|---|
| CLIP + OCR blocking upload response (~30–60s) | **BackgroundTasks** — respond in <2s, AI runs after |
| Full-res images fed to CLIP/OCR | **Resize to 512×512** before inference (3–5× faster) |
| No file size limit | Reject files > 5 MB |
| JPEG quality uncontrolled | Save at quality=80 (smaller storage) |
| Gallery didn't expose processing status | `processing: true/false` field in `/gallery` response |
| Sequential per-image processing | Each image's background task is independent |

---

## 🚀 Running Locally

### Option A — Python directly

```bash
# 1. Create virtual environment
cd recall
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install deps
pip install -r backend/requirements.txt

# 3. Run from project root (so frontend/ is found)
python backend/main.py
```
Open → http://localhost:8000

---

### Option B — Docker (recommended)

```bash
cd recall
docker compose up --build
```
Open → http://localhost:8000

Data persists in the `recall_data` Docker volume.

---

## 🌐 Deployment (Production)

### Railway / Render / Fly.io

1. Push the `recall/` folder to a GitHub repo  
2. Point the platform to the `Dockerfile`  
3. Set port to `8000`  
4. Mount a persistent volume at `/app/.recall_data`

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | Server port |

---

## 🔑 Google Drive Integration

In `frontend/script.js`, replace:

```js
const DRIVE_CLIENT_ID = 'PLACEHOLDER_CLIENT_ID';
const DRIVE_APP_ID    = 'PLACEHOLDER_APP_ID';
const DRIVE_API_KEY   = 'PLACEHOLDER_API_KEY';
```

Follow [Google Picker API docs](https://developers.google.com/drive/picker) to generate credentials.

---

## 🔒 Notes

- Passwords are stored in plain text in `users.pkl` — suitable for personal/demo use only. For production, hash passwords with `bcrypt`.
- The pickle DB is single-file. For scale, migrate to SQLite or PostgreSQL + pgvector.
