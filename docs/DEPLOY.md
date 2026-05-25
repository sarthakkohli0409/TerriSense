# TerriSense Deployment Guide

Free hosting with no card required:
- **Frontend** → Vercel (completely free, no card ever)
- **Backend** → Railway (free $5/month credit, no card to start)

---

## Step 1 — Push to GitHub

```bash
cd terrisense
git init
git add .
git commit -m "Initial TerriSense commit"
git remote add origin https://github.com/YOUR_USERNAME/TerriSense.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Deploy Backend on Railway

1. Go to **railway.app** → sign up with GitHub (no card needed)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `TerriSense` repo
4. Railway auto-detects Python via `nixpacks.toml` — no extra config needed
5. Once deployed, click the service → **Settings** → **Networking** → **Generate Domain**
6. Copy the domain — looks like `terrisense-backend.up.railway.app`
7. Under **Variables**, add:

| Key               | Value                                        |
|-------------------|----------------------------------------------|
| `CORS_ORIGINS`    | *(leave blank for now — fill in after step 3)* |
| `MAX_UPLOAD_ROWS` | `100000`                                     |

---

## Step 3 — Deploy Frontend on Vercel

1. Go to **vercel.com** → sign up with GitHub (no card, no credit limit)
2. Click **Add New** → **Project**
3. Import your `TerriSense` repo
4. Set:

| Field              | Value           |
|--------------------|-----------------|
| Root Directory     | `frontend`      |
| Framework Preset   | Vite            |
| Build Command      | `npm run build` |
| Output Directory   | `dist`          |

5. Under **Environment Variables**, add:

| Key            | Value                                          |
|----------------|------------------------------------------------|
| `VITE_API_URL` | your Railway backend URL from step 2           |

6. Click **Deploy** — Vercel handles the SPA rewrite automatically via `vercel.json`
7. Copy your Vercel URL — looks like `terrisense.vercel.app`

---

## Step 4 — Wire up CORS

1. Go back to Railway → your backend service → **Variables**
2. Set `CORS_ORIGINS` to your Vercel frontend URL:
   ```
   https://terrisense.vercel.app
   ```
3. Railway redeploys automatically on variable save

---

## Step 5 — Verify

- Open your Vercel URL in the browser
- Complete the Selection step and upload `docs/sample_hcp_data.csv` to test
- Check backend is alive: `https://your-backend.up.railway.app/health`

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
cp .env.example .env        # set VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Open http://localhost:5173 · API docs at http://localhost:8000/docs

---

## Browser-only Mode (no backend needed)

Every page has a "Use backend API" checkbox. Uncheck it to run everything
in the browser — useful for demos without a live backend.

---

## Troubleshooting

**CORS errors** — `CORS_ORIGINS` on Railway must exactly match your Vercel
URL with no trailing slash.

**Railway sleeping** — free tier services sleep after inactivity, similar
to Render. First request after sleep takes ~10–20s.

**Vercel build fails** — make sure Root Directory is set to `frontend`,
not the repo root. The `vercel.json` must be inside `frontend/`.

**uszips.csv not found** — the file must be committed to the repo inside
`backend/`. Check it wasn't excluded by `.gitignore`.
