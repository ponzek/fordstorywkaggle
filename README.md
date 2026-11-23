# Beyond Ford: Exploring Affordable Used-Car Alternatives in the United States

> **Kean University · CPS 5745 Project 2**  
> **Team:** Danny Munoz · Karina Ponze · Bobbi Perry · Braulio Encarnacion  
> **Question:** In historical U.S. listings, which compact SUVs fit the same budget as a **Ford Escape** (`2016–2019`, `≤125,000 mi`, clean title, `$2,000–$60,000`), and how do the options change by region and model year?

This repository extends Danny Munoz's Project 1 ([live Project 1 aesthetic](https://ildannyli.github.io/fordstorywkaggle/)) from a single-make Ford view to **five U.S. compact SUVs** (**Ford Escape**, **Chevrolet Equinox**, **Honda CR-V**, **Toyota RAV4**, **Nissan Rogue**) across **nine connected D3 views**, a budget playback animation, and a **Gemini AI Chart Explainer & Best-Case Scenario** helper.

---

## Table of Contents
- [1. Quick Start (2 Minutes)](#1-quick-start-2-minutes)
- [2. Teammate Guide — Who Owns What](#2-teammate-guide--who-owns-what)
- [3. Repository Map (What Each File Does)](#3-repository-map-what-each-file-does)
- [4. The Nine Connected Views](#4-the-nine-connected-views)
- [5. Live Presentation Walkthrough](#5-live-presentation-walkthrough)
- [6. Plugging In the Full Raw Kaggle CSVs](#6-plugging-in-the-full-raw-kaggle-csvs)
- [7. Team Git & Safety Checklist](#7-team-git--safety-checklist)
- [8. References & Credits](#8-references--credits)

---

## 1. Quick Start (2 Minutes)

### Prerequisites
- **Python 3.10+** (`pandas`, `numpy`, `flask`, `requests`, `python-dotenv`)
- **Node.js** (only needed if you run `python verify.py` to re-run the 20 automated checks)

Install Python packages once:
```bash
pip install -r requirements.txt
```

### Option A — Run Locally with Live Gemini AI Explainer (Recommended)
`server.py` serves the website and keeps your Gemini API key private on your machine (never exposed in browser JS or pushed to GitHub).

1. **Create your private `.env` file** by copying `.env.example`:
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```
2. **Paste your Gemini (and/or optional OpenAI fallback) API key** inside `.env`:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   GEMINI_MODEL=gemini-3.5-flash-lite
   # Optional automatic fallback if Gemini hits high demand:
   # OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini
   ```
3. **Start the app:**
   ```bash
   python server.py
   ```
4. Open **http://127.0.0.1:5000/** in Chrome, Edge, Firefox, or Safari.

> **Note:** If Gemini is offline or `.env` is missing, the explainer automatically shows deterministic, chart-verified local captions and best-case scenarios so the demo never breaks.

### Option B — Static / Offline / GitHub Pages Mode (No API Key Needed)
```bash
python -m http.server 8000
```
Open **http://127.0.0.1:8000/**. All nine D3 views, filters, animation playback, and verified local captions work completely offline (`d3.min.js` v7.9.0 is bundled).

---

## 2. Teammate Guide — Who Owns What

Every view is isolated into its own JavaScript file so teammates can review or edit their section cleanly without stepping on each other:

| Team Member | Owns in Code | Views / Responsibility | Presentation Segment |
|---|---|---|---|
| **Danny Munoz** | `ui.js`, `style.css`, `v1_budget.js`–`v4_mileage.js` | Shared filter state, colors/shapes, Views 1–4 (Budget coverage, Spread, Model year, 2D Mileage–Price) | Introduces shopper question, audience, Project 1 (`A1–A3`) lessons, and Views 1–4 |
| **Karina Ponze** | `prepare_data.py`, `core.js`, `v5_gaps.js`, `verify.py` | Data cleaning, U.S. Census regions, View 5 (Matched gaps vs. Escape), `25/25` verification checks | Explains sources/dates, cleaning rules, CarGurus comparison, and View 5 strata |
| **Bobbi Perry** | `v6_regions.js`, `v7_condition.js`, `PILOT_GUIDE.md` | Views 6–7 (Census region availability, Seller condition mix) & audience pilot testing | Demonstrates budget/region changes and reports 5-person pilot results |
| **Braulio Encarnacion** | `v8_fuel.js`, `v9_shortlist.js`, `explainer.js`, `server.py` | Views 8–9 (Fuel-cost scenario, Historical shortlist) & Gemini AI Chart Explainer + Best Case | Opens exact listing in View 9, shows fuel scenario, runs live AI explainer, backup demo |

---

## 3. Repository Map (What Each File Does)

```text
fordstorywkaggle/
├── index.html                 # Main 3-act webpage structure + filter bar + 9 view cards + AI section
├── style.css                  # Light/dark theme tokens & layout (matches Project 1 aesthetic)
├── main.js                    # Wires filter bar, $10k–$20k animation, insights, limits & references
├── ui.js                      # Shared State object, USD/mile formatters, model colors & shapes
├── core.js                    # Pure math/filter/summary engine (shared by browser AND verify.py)
├── data.js                    # Pre-built columnar dataset loaded by index.html (window.BEYOND_FORD)
├── d3.min.js                  # Bundled D3 v7.9.0 (works 100% offline)
│
├── v1_budget.js               # View 1: Budget coverage step lines + CarGurus comparison table
├── v2_spread.js               # View 2: Asking-price spread (median + middle 50% IQR)
├── v3_year.js                 # View 3: Median asking price by model year (2016–2019)
├── v4_mileage.js              # View 4: 2D odometer vs. asking price scatter linked to View 9
├── v5_gaps.js                 # View 5: Matched year × 25k-mile price gaps vs. Ford Escape
├── v6_regions.js              # View 6: U.S. Census region availability (Northeast/Midwest/South/West)
├── v7_condition.js            # View 7: Seller-reported condition mix (Unknown preserved)
├── v8_fuel.js                 # View 8: Annual fuel-cost estimator ((mi/yr ÷ MPG) × $/gal)
├── v9_shortlist.js            # View 9: Sortable historical listing shortlist (public CL-xxxx keys)
│
├── explainer.js               # Frontend AI explainer: fact-checks Gemini replies & drops stale answers
├── server.py                  # Small Flask server keeping GEMINI_API_KEY private (.env)
├── .env.example               # Template for GEMINI_API_KEY (copy to .env locally; never commit .env)
├── .gitignore                 # Ignores .env, __pycache__, and raw multi-GB Kaggle CSVs
├── requirements.txt           # Python dependencies for teammates
│
├── prepare_data.py            # Cleans raw Kaggle CSVs (in data/ or data/raw/) -> data.js
├── verify.py                  # Runs 25 independent pandas/NumPy vs. core.js tests
├── core_cli.js                # Node bridge allowing verify.py to call core.js directly
├── verification.js            # Auto-generated check results displayed in the Methodology section
├── verification_report.md     # Markdown table of the 25/25 passing checks
├── PILOT_GUIDE.md             # 5-person audience pilot tasks + Wang et al. (VIS 2026) trust survey
└── data/
    ├── vehicles.csv           # (git-ignored) Raw Kaggle Craigslist CSV (~1.16 GB local)
    ├── used_cars_data.csv     # (git-ignored) Raw Kaggle CarGurus CSV (~9.98 GB local)
    └── processed/
        ├── reese_clean.csv        # 1,486 cleaned Craigslist rows with public CL-xxxx keys
        ├── cleaning_report.json   # Row-by-row cleaning funnel counts
        └── cargurus_summary.json  # Second-source CarGurus benchmark (79,483 rows)
```

*(Project 1 legacy files `ford.csv`, `ford_clean.csv`, `model_coefs.json`, `median_price_by_model_age.csv`, and `REPORT_DRAFT.md` remain archived in the repo for comparison.)*

---

## 4. The Nine Connected Views

All views share one live state (`State` in `ui.js`): changing any filter or clicking a mark updates the whole story together.

| # | View | What It Answers | Interactive Links |
|---|---|---|---|
| **1** | **Budget coverage** | What % of each SUV fits any dollar cap? | Click/drag budget cap, press **Play $10k–$20k**, or click a model tile to focus Views 4 & 6; includes **CarGurus (Mital)** comparison table |
| **2** | **Asking-price spread** | What is the median and middle 50% price per model? | Click/Enter a model row to focus Views 4 & 6 |
| **3** | **Price by model year** | How do 2016–2019 cohorts sit against the cap? | Click a year point to isolate a single model year (click again to restore `2016–2019`) |
| **4** | **Mileage vs. price** | What odometer trade-off buys a lower price? | Click/Enter any listing point to open & highlight it in View 9 and load its MPG in View 8 |
| **5** | **Matched price gaps** | In identical year & 25k-mi bands, how do rivals compare to Escape? | Toggle `10 / 15 / 20` min per side; click a model to inspect strata; click a stratum to filter Views 4 & 9 |
| **6** | **Regional availability** | How does budget fit shift across U.S. Census regions? | Click any region bar (`Northeast`, `Midwest`, `South`, `West`) to filter the entire app |
| **7** | **Listed condition** | What condition mix sits inside your budget? | Click a condition bar (including `Unknown`) to filter View 9 |
| **8** | **Fuel-cost scenario** | How much will fuel cost per year? | Adjust annual miles (`0–30k`), `$/gal` (`$0–$10`), or MPG (`5–100`), or load a row's EPA ref MPG from View 9 |
| **9** | **Historical shortlist** | Which exact historical ads back up the chart? | Sort any column; click/Enter a row to highlight it in View 4 and send it to View 8 |

---

## 5. Live Presentation Walkthrough

To run the team's planned presentation scenario cleanly from a fresh state (using the loaded real Kaggle datasets: **1,486** Craigslist listings `2026-09-30 to 2026-11-03` and **79,483** CarGurus listings `2017-03-31 to 2020-09-13`):
1. Click **Reset everything** in the top filter bar (`$15,000` cap, all 5 SUVs, `2016–2019`, `0–125,000 mi`, `All U.S.`).
2. Lower the cap to **`$12,500`** (`881` qualifying listings), then step **`+$2.5k`** back to **`$15,000`** (`1,095` listings — **`+214` unlocked**, `623` non-Ford, Escape `472/493 = 95.7%`, Rogue `272/303 = 89.8%`, Equinox `290/335 = 86.6%`, while RAV4 is `18.0%` and CR-V is `16.5%`).
3. Click a **Census region bar** in View 6 (e.g., **Midwest**) to show regional availability update across all charts.
4. Click a qualifying non-Ford dot in **View 4** (or a row in **View 9**) to see its exact record and fuel estimate in **View 8** (`12,000 mi/yr` at `25 MPG` & `$3.50/gal` = `$1,680/yr`).
5. Click **Explain this chart** (or **Explain + Best Case**) to ask Gemini AI what changed and what the **best-case non-Ford scenario** is—backed by verified chart counts.

---

## 6. Plugging In / Refreshing the Full Raw Kaggle CSVs

Real Kaggle data is currently loaded (`meta.isPreview = false` in `data.js`). If a raw CSV is absent, `prepare_data.py` falls back automatically to a deterministic **Calibrated Preview Dataset** (`meta.isPreview = true`, disclosed in a banner at the top of the page).

To rebuild from raw Kaggle downloads on another machine:
1. Place the downloaded files in `data/` or `data/raw/` inside this repo (both paths are git-ignored automatically):
   - Austin Reese's Craigslist CSV ([craigslist-carstrucks-data](https://www.kaggle.com/datasets/austinreese/craigslist-carstrucks-data)) as `data/vehicles.csv` (or `data/raw/vehicles.csv`).
   - *(Optional)* Ananay Mital's CarGurus CSV ([us-used-cars-dataset](https://www.kaggle.com/datasets/ananaymital/us-used-cars-dataset)) as `data/used_cars_data.csv` (or `data/raw/used_cars_data.csv`).
2. Run preparation and verification:
   ```bash
   python prepare_data.py
   python verify.py
   ```
   Confirm `verify.py` prints `25/25 checks passed.` before refreshing the browser.

---

## 7. Team Git & Safety Checklist

Before pushing changes to GitHub:
- [ ] **Never commit `.env`** or raw Kaggle CSVs (`.gitignore` already blocks `.env`, `data/*.csv`, and `data/raw/*.csv`).
- [ ] Run `git pull origin main` before starting edits.
- [ ] If you touch `prepare_data.py` or `core.js`, run `python verify.py` and confirm **25/25 checks pass**.
- [ ] Check `git status` so only intended source files are staged.

---

## 8. References & Credits

- **Project 1 Baseline & Aesthetic:** Danny Munoz, *How fast does a used Ford lose its value?* ([Live Demo](https://ildannyli.github.io/fordstorywkaggle/)) · [Adhurim Quku Ford Dataset](https://www.kaggle.com/datasets/adhurimquku/ford-car-price-prediction)
- **Primary & Second-Source U.S. Data:** [Austin Reese — Used Cars Dataset (Kaggle v10, Craigslist)](https://www.kaggle.com/datasets/austinreese/craigslist-carstrucks-data) · [Ananay Mital — US Used Cars Dataset (Kaggle v1, CarGurus Sep 2020)](https://www.kaggle.com/datasets/ananaymital/us-used-cars-dataset)
- **Additional Comparative Datasets & Market Context:** [Aditya Desai — 100,000 UK Used Car Dataset](https://www.kaggle.com/datasets/adityadesai13/used-car-dataset-ford-and-mercedes) · [Aishwarya Muthukumar — Multi-Make Cars Dataset](https://www.kaggle.com/datasets/aishwaryamuthukumar/cars-dataset-audi-bmw-ford-hyundai-skoda-vw) · [CarGurus Price Trends](https://www.cargurus.com/research/price-trends) · [CarGurus Car Valuation](https://www.cargurus.com/research/car-valuation)
- **Research & Visualization Standards:** Kim et al. ([IEEE VIS 2026 Expectation-Aligned Design](https://ieeevis.org/year/2026/program/content/697bbf3e-0027-400e-aed4-9e2cf08a1047/)) · Wang et al. ([IEEE TVCG / VIS 2026 Visualization Trust](https://ieeevis.org/year/2026/program/content/df4047c2-fb36-40bb-b522-1d213c6b1d84/)) · Engers et al. ([*Annual miles drive used car prices*, 2009](https://doi.org/10.1002/jae.1034)) · Prieto et al. ([*Hedonic price model & reliability*, 2015](https://doi.org/10.1016/j.jretconser.2014.08.013))
- **Standards & APIs:** [U.S. Census Bureau Regions](https://www.census.gov/data/data-tools/survey-explorer/geo.html) · [FuelEconomy.gov EPA Data](https://www.fueleconomy.gov/feg/download.shtml) · [Live Motion Labs](https://unit12-live-motion-labs.vercel.app/) · [Google Gemini Structured Outputs](https://aistudio.google.com/docs/structured-output)
