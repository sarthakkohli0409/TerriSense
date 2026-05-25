# TerriSense

**Pharma Commercial Deployment Planning Platform**

TerriSense is a sizing-led territory alignment platform for pharmaceutical commercial excellence teams. It guides users from business strategy through HCP segmentation, sales force sizing, territory alignment, and territory quality diagnosis.

---

## Architecture

```
terrisense/
├── frontend/          # React + Vite + Tailwind CSS
├── backend/           # Python FastAPI
├── docs/              # Sample data and deployment guides
└── README.md
```

---

## Quick Start (Local)

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- pip

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/terrisense.git
cd terrisense
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs at: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173

---

## Environment Variables

### Frontend (.env in /frontend)
```
VITE_API_URL=http://localhost:8000
```

### Backend (.env in /backend)
```
CORS_ORIGINS=http://localhost:5173
MAX_UPLOAD_ROWS=100000
```

---

## Workflow

```
Selection → Data Upload → Segmentation → SF Sizing → Territory Alignment → Dashboard
```

1. **Selection** — Brand, therapy area, launch type, planning objective, state alignment preference
2. **Data Upload** — HCP/account CSV with ZIP, state, lat/lon, metrics
3. **Segmentation** — Composite score weighting, tier assignment, call plan definition
4. **Sales Force Sizing** — Capacity + Potential + ROI triangulation → Final K
5. **Territory Alignment** — Geographic contiguous territory creation using Final K
6. **Dashboard** — Quality diagnosis, charts, Excel/PDF export

---

## GitHub Deployment

```bash
git init
git add .
git commit -m "Initial TerriSense commit"
git remote add origin https://github.com/YOUR_ORG/terrisense.git
git push -u origin main
```

---

## Render Deployment

### Backend (Web Service)
- **Root directory:** `backend`
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Environment:** Python 3.11

### Frontend (Static Site)
- **Root directory:** `frontend`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Environment variable:** `VITE_API_URL=https://your-backend.onrender.com`

---

## Sample Data

See `docs/sample_hcp_data.csv` for the expected upload format.

Required columns: `hcp_id`, `zip`, `state`, `lat`, `lon`
Optional: `specialty`, `trx`, `nrx`, `patient_potential`, `call_history`

---

## Key Formulas

### Capacity Sizing
```
Effective Rep Capacity = Calls/Day × Working Days × (1 - Non-Selling %)
Total Calls Required   = Σ (HCPs in segment × Reach % × Call Frequency)
Capacity K             = Total Calls Required / Effective Rep Capacity
```

### Potential Sizing
```
Potential K = Covered Market Potential / Desired Potential per Rep
```

### ROI Sizing
```
ROI K = (Revenue Opportunity / Revenue per Rep) × Diminishing Return Factor
```

### Strategic K
```
Strategic K = Capacity K × W_cap + Potential K × W_pot + ROI K × W_roi
Final K     = min(Strategic K, Budget K)
```

---

## License
Proprietary. For commercial licensing contact your Anthropic account team.
