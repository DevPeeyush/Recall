"""
Recall Backend — main.py
Optimized:
  • Background AI processing (instant upload response)
  • Image resize before CLIP + OCR (3–5× faster)
  • Max file size guard (5 MB)
  • Processing status exposed in /gallery and /search
  • Compressed JPEG save (quality=80)
  • Thread-safe DB write with a lock
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List
from pydantic import BaseModel
import uvicorn
import os
import io
import uuid
import shutil
import threading
import pickle

from PIL import Image

# ── Paths ────────────────────────────────────────────────────
DATA_DIR   = ".recall_data"
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_FILE    = os.path.join(DATA_DIR, "database.pkl")
USERS_FILE = os.path.join(DATA_DIR, "users.pkl")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── AI Models (loaded once at startup) ──────────────────────
print("Loading CLIP (visual search) model…")
from sentence_transformers import SentenceTransformer, util
clip_model = SentenceTransformer('clip-ViT-B-32')

print("Loading EasyOCR (text extraction) model…")
import easyocr
ocr_reader = easyocr.Reader(['en'], gpu=False)

# ── Constants ────────────────────────────────────────────────
MAX_FILE_SIZE    = 5 * 1024 * 1024   # 5 MB hard limit
PROCESS_IMG_SIZE = (512, 512)         # Resize before CLIP/OCR — 3–5× faster
SAVE_QUALITY     = 80                 # JPEG quality for stored images

# ── Database ─────────────────────────────────────────────────
db_lock = threading.Lock()

def _load_pkl(path, fallback_path=None):
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    if fallback_path and os.path.exists(fallback_path):
        with open(fallback_path, "rb") as f:
            return pickle.load(f)
    return {}

db       = _load_pkl(DB_FILE, "database.pkl")
users_db = _load_pkl(USERS_FILE, "users.pkl")

# Migrate old paths (uploads/xxx → .recall_data/uploads/xxx)
_migrated = False
for k, v in db.items():
    if "path" in v and not v["path"].startswith(DATA_DIR):
        old = v["path"]
        new = os.path.join(DATA_DIR, old)
        os.makedirs(os.path.dirname(new), exist_ok=True)
        if os.path.exists(old) and not os.path.exists(new):
            shutil.copy(old, new)
        v["path"] = new
        _migrated = True

def save_db():
    with db_lock:
        with open(DB_FILE, "wb") as f:
            pickle.dump(db, f)

def save_users():
    with open(USERS_FILE, "wb") as f:
        pickle.dump(users_db, f)

if _migrated:
    save_db()

# ── FastAPI App ───────────────────────────────────────────────
app = FastAPI(title="Recall API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory=UPLOAD_DIR), name="images")

@app.get("/")
async def serve_frontend():
    return FileResponse("frontend/index.html")

@app.get("/style.css")
async def serve_css():
    return FileResponse("frontend/style.css")

@app.get("/script.js")
async def serve_js():
    return FileResponse("frontend/script.js")

# ── Auth ──────────────────────────────────────────────────────
class UserLogin(BaseModel):
    email: str
    password: str

@app.post("/login")
async def login(user: UserLogin):
    email = user.email.lower().strip()
    if email not in users_db:
        uid = str(uuid.uuid4())
        users_db[email] = {"password": user.password, "id": uid}
        save_users()
        return {"message": "Signup successful", "user_id": uid, "email": email}
    if users_db[email]["password"] == user.password:
        return {"message": "Login successful", "user_id": users_db[email]["id"], "email": email}
    raise HTTPException(status_code=401, detail="Invalid password")

# ── Gallery ───────────────────────────────────────────────────
@app.get("/gallery")
async def get_gallery(user_id: str = None):
    results = []
    for file_id, data in reversed(list(db.items())):
        if not os.path.exists(data["path"]):
            continue
        if data.get("in_trash"):
            continue
        if user_id and data.get("user_id") != user_id:
            continue
        results.append({
            "file_id":      file_id,
            "url":          f"/images/{data['filename']}",
            "text_found":   data.get("extracted_text", ""),
            "processing":   data.get("processing", False),   # ← NEW: tells frontend if AI is pending
        })
    return {"results": results}

# ── Background AI Processor ───────────────────────────────────
def process_image_background(file_id: str, filepath: str):
    """
    Runs in a background thread after instant upload response.
    Resizes image → CLIP embedding → OCR → updates DB.
    """
    try:
        image = Image.open(filepath).convert("RGB")

        # Resize for faster AI inference (3–5× speedup vs full-res)
        image_small = image.resize(PROCESS_IMG_SIZE, Image.LANCZOS)

        # CLIP visual embedding
        embedding = clip_model.encode(image_small)

        # OCR on resized image (much faster than full-res)
        small_buf = io.BytesIO()
        image_small.save(small_buf, format="JPEG", quality=85)
        small_buf.seek(0)
        ocr_results = ocr_reader.readtext(small_buf.read(), detail=0)
        extracted_text = " ".join(ocr_results).strip().lower()

        with db_lock:
            if file_id in db:
                db[file_id]["img_embedding"]  = embedding
                db[file_id]["extracted_text"] = extracted_text
                db[file_id]["processing"]     = False   # Mark done

        save_db()
        print(f"[Recall] ✓ Processed {file_id}: '{extracted_text[:60]}'")

    except Exception as e:
        print(f"[Recall] ✗ Error processing {file_id}: {e}")
        with db_lock:
            if file_id in db:
                db[file_id]["processing"] = False
        save_db()

# ── Upload ────────────────────────────────────────────────────
@app.post("/upload")
async def upload_image(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user_id: str = Form(None)
):
    responses = []

    for file in files:
        if not file.content_type.startswith("image/"):
            continue

        content = await file.read()

        # Guard: reject over-size uploads
        if len(content) > MAX_FILE_SIZE:
            responses.append({"error": f"{file.filename} exceeds 5 MB limit"})
            continue

        try:
            image = Image.open(io.BytesIO(content)).convert("RGB")

            file_id  = str(uuid.uuid4())
            filename = f"{file_id}.jpg"          # always save as JPEG
            filepath = os.path.join(UPLOAD_DIR, filename)

            # Save compressed JPEG (saves disk + speeds future reads)
            image.save(filepath, format="JPEG", quality=SAVE_QUALITY, optimize=True)

            # ── Instant DB entry (processing=True) ──
            with db_lock:
                db[file_id] = {
                    "path":           filepath,
                    "filename":       filename,
                    "img_embedding":  None,       # filled by background task
                    "extracted_text": "",         # filled by background task
                    "in_trash":       False,
                    "user_id":        user_id,
                    "processing":     True,       # AI not done yet
                }

            # ── Schedule AI work in background ──
            background_tasks.add_task(process_image_background, file_id, filepath)

            responses.append({
                "message":    "Image uploaded — AI indexing in background",
                "file_id":    file_id,
                "url":        f"/images/{filename}",
                "processing": True,
            })

        except Exception as e:
            print(f"[Recall] Upload error for {file.filename}: {e}")

    # Save skeleton DB entries immediately (so gallery shows images at once)
    save_db()
    return {"results": responses}

# ── Search ────────────────────────────────────────────────────
@app.get("/search")
async def search_images(query: str, top_k: int = 24, user_id: str = None):
    if not db:
        return {"results": []}

    query_lower     = query.lower()
    query_embedding = clip_model.encode(query)

    results = []
    for file_id, data in list(db.items()):
        if not os.path.exists(data["path"]):
            continue
        if data.get("in_trash"):
            continue
        if user_id and data.get("user_id") != user_id:
            continue
        if data.get("processing") or data.get("img_embedding") is None:
            continue   # skip un-indexed images in search

        visual_score = util.cos_sim(query_embedding, data["img_embedding"]).item()
        text_score   = 1.0 if query_lower in data.get("extracted_text", "") else 0.0
        final_score  = max(visual_score, text_score)

        results.append({
            "file_id":      file_id,
            "url":          f"/images/{data['filename']}",
            "text_found":   data.get("extracted_text", ""),
            "score":        final_score,
            "visual_score": visual_score,
            "text_score":   text_score,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results[:top_k]}

# ── Trash ─────────────────────────────────────────────────────
@app.get("/trash")
async def get_trash(user_id: str = None):
    results = []
    for file_id, data in reversed(list(db.items())):
        if not data.get("in_trash"):
            continue
        if user_id and data.get("user_id") != user_id:
            continue
        results.append({
            "file_id":    file_id,
            "url":        f"/images/{data['filename']}",
            "text_found": data.get("extracted_text", ""),
        })
    return {"results": results}

@app.post("/trash/{file_id}")
async def move_to_trash(file_id: str):
    if file_id not in db:
        raise HTTPException(status_code=404, detail="File not found")
    db[file_id]["in_trash"] = True
    save_db()
    return {"message": "Moved to trash"}

@app.post("/trash/delete/{file_id}")
async def delete_from_trash(file_id: str):
    if file_id not in db:
        raise HTTPException(status_code=404, detail="File not found")
    path = db[file_id].get("path")
    if path and os.path.exists(path):
        try: os.remove(path)
        except Exception: pass
    del db[file_id]
    save_db()
    return {"message": "Permanently deleted"}

@app.post("/empty-trash")
async def empty_trash(user_id: str = None):
    to_delete = [
        fid for fid, data in db.items()
        if data.get("in_trash") and (not user_id or data.get("user_id") == user_id)
    ]
    for fid in to_delete:
        path = db[fid].get("path")
        if path and os.path.exists(path):
            try: os.remove(path)
            except Exception: pass
        del db[fid]
    save_db()
    return {"message": f"Emptied {len(to_delete)} item(s) from trash"}

@app.post("/restore/{file_id}")
async def restore_from_trash(file_id: str):
    if file_id not in db:
        raise HTTPException(status_code=404, detail="File not found")
    db[file_id]["in_trash"] = False
    save_db()
    return {"message": "Restored"}

# ── Entry Point ───────────────────────────────────────────────
import os
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
