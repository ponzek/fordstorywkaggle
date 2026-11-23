# Audience Pilot & Visualization Trust Evaluation Guide

> **Lead:** Bobbi Perry (with all teammates supporting)  
> **Proposal Reference:** `CPS_5745_Final_Project_Proposal.pdf` (Sections II, IV, Table II)  
> **Literature Basis:** Wang et al., *"Do You 'Trust' This Visualization? An Inventory to Measure Trust in Visualizations"*, IEEE TVCG / VIS 2026

This guide runs the **5-person audience pilot** required before final release and presentation. It directly tests whether first-time, budget-conscious U.S. shoppers can use the app unaided, trust where the numbers come from, and compare the verified local caption against the Gemini AI explanation.

---

## 0. Project 1 Recovered Feedback Log (Proposal Section III-A)

Per Section III-A of `CPS_5745_Final_Project_Proposal.pdf`, record any verified anonymous classmate notes recovered from Project 1 presentations and link each to a Project 2 artifact and change:

| Feedback Type | Anonymous Note (No Names) | Linked Project 1 Artifact (`A1–A3`) | Design or Presentation Change Applied |
|---|---|---|---|
| Instructor (`F1`) | Include other makes so buyers have options beyond Ford. | `A1–A3` | Added Equinox, CR-V, RAV4, and Rogue across Views 1–9; Task 1 tests finding a non-Ford listing. |
| Team (`F2`) | Focus on the U.S. market (USD, miles, 4 Census regions; state source & date upfront). | `A1–A3` | Switched to U.S. Craigslist + CarGurus, USD, miles, 4 Census regions, and masthead source/date pills. |
| AI Review (`A1–A3`) | Keep age & mileage ideas; adapt 3D into 2D linked to records; use counts & gaps instead of RMSE. | `A1`, `A2`, `A3` | Replaced 3D scatter with linked 2D View 4 + View 9 shortlist, and added View 5 matched strata & counts. |
| Classmate Note 1 *(fill if recovered)* | | | |
| Classmate Note 2 *(fill if recovered)* | | | |

---

## 1. Setup Before Each Session
1. Open the app (`http://127.0.0.1:5000/` if running `python server.py` with Gemini AI, or `http://127.0.0.1:8000/` via `python -m http.server`).
2. Click **Reset everything** in the sticky filter bar so every participant starts from identical defaults (`$15,000` cap, all 5 SUVs, `2016–2019`, `0–125,000 mi`, `All U.S.`).
3. Have a stopwatch/timer ready and avoid coaching during the tasks unless the participant gets stuck (log any help given).

---

## 2. Three Shopper Tasks (From Proposal Section IV)

Ask each participant (5 classmates or target first-time buyers) to complete these tasks out loud without hints:

| Task | Prompt to Give the Participant | Success Criteria |
|---|---|---|
| **Task 1: Find a non-Ford alternative** | *"At the starting `$15,000` budget, find a compact SUV other than a Ford Escape and pick a specific listing."* | Participant identifies a non-Ford SUV (e.g., Chevrolet Equinox, Nissan Rogue, Honda CR-V, Toyota RAV4) and opens/selects an exact record in View 4 or View 9. |
| **Task 2: Explain a trade-off** | *"Compare that alternative to a Ford Escape and name one trade-off."* | Participant cites a real data trade-off (e.g., lower asking price at higher odometer miles, older model year, `Unknown` condition, or regional availability). |
| **Task 3: Identify source, date & trust** | *"Where do these numbers come from, and what date range do they cover?"* | Participant locates the masthead trust strip / View 1 comparison (`Austin Reese Kaggle v10 Craigslist, April 4–May 4, 2021`, plus `CarGurus Sep 2020`). |

**Bonus Explainer Check (Standard Caption vs. Gemini AI):**  
Step the budget from `$12,500` to `$15,000`, then show the participant both:
1. The **Verified Local Caption + Best-Case Scenario**
2. The **Gemini AI Chart Explanation + Best-Case Scenario**  
Ask: *"Are both accurate to the chart, and which one is clearer for a first-time buyer?"*

**Proposal Target:** At least **4 of 5 participants** complete Task 1 and Task 2 **unaided**.

---

## 3. Wang et al. (VIS 2026) Trust Inventory

After the tasks, ask participants to rate the four validated **Trust in Visualization** items on a **6-point Likert scale** (`1` = Strongly Disagree, `2` = Disagree, `3` = Slightly Disagree, `4` = Slightly Agree, `5` = Agree, `6` = Strongly Agree):

| # | Item (Wang et al., Table I) | Direction | Scoring Formula |
|---|---|---|---|
| 1 | *"I find this visualization easy to understand."* | Positive (`+`) | Raw score (`1–6`) |
| 2 | *"I find this visualization difficult to use."* | Negative (`−`) | Reverse-coded (`7 − score`) |
| 3 | *"I am skeptical about the information presented in this visualization."* | Negative (`−`) | Reverse-coded (`7 − score`) |
| 4 | *"I trust this data."* | Positive (`+`) | Raw score (`1–6`) |

**Composite Visualization Trust Score (`1.0–6.0`):**  
`Trust Score = (Q1 + (7 - Q2) + (7 - Q3) + Q4) / 4`

*(Optional Individual Control — Wang et al. General Trust Disposition, same 6-point scale: "Have a good word for everyone", "Retreat from others" [reverse], "Avoid contacts with others" [reverse], "Respect others".)*

Finally, collect **one anonymous comment**: *"What was clearest, and what was most confusing?"*

---

## 4. Pre-Pilot Dry Run & Label Revisions (Automated Walkthrough — Not Human Participant Data)

> **Transparency Note:** The walkthrough below is an automated pre-pilot verification against the live data and UI before running the 5 human participants (`P1–P5`). Human pilot rows in Section 5 remain blank until your team tests 5 real classmates or target shoppers.

### Verified Walkthrough Results for the 3 Shopper Tasks (`$15,000` Reset State)
| Check | Verified Result Observed in App & Dataset | Status |
|---|---|---|
| **Task 1 (Find non-Ford option)** | At `$15,000`, `148` non-Ford listings qualify out of `277` total (`Chevrolet Equinox`: `81/345` = `23.5%`; `Nissan Rogue`: `41/312` = `13.1%`; `Honda CR-V`: `15/260` = `5.8%`; `Toyota RAV4`: `11/240` = `4.6%`). Selecting `CL-0033` (`2016 Chevrolet Equinox`, `59,352 mi`, `$14,900`, `AZ`, `Excellent`) or `CL-0202` (`2018 Chevrolet Equinox`, `36,531 mi`, `$7,435`, `MI`, `Excellent`) in View 4 highlights the exact row in View 9 and loads its MPG in View 8. | **Verified** |
| **Task 2 (Explain a trade-off)** | Two clear trade-offs appear directly from the charts: **(1) Price vs. mileage:** `CL-0033` (`2016 Equinox`, `$14,900`, `59,352 mi`) costs `$1,905` more than `CL-0364` (`2016 Escape` in `NJ`, `$12,995`, `118,854 mi`), trading lower price for `59,502` fewer miles on the Equinox. **(2) Brand premium in View 5:** Controlling for identical model years and 25k-mile bands (`≥15/side`), Equinox runs `-$333` cheaper vs. Escape (`11` matching groups), whereas CR-V (`+$4,643`, `8` groups) and RAV4 (`+$6,116`, `8` groups) cost more. | **Verified** |
| **Task 3 (Identify source & date)** | Top masthead pills explicitly show **`Data source: Austin Reese Kaggle v10 (U.S. Craigslist)`** and **`Listing dates: 2021-04-04 to 2021-05-04`** (`1,633` rows across `48` states/D.C.); View 1 shows **`CarGurus (Mital Sep 2020)`** alongside Craigslist. | **Verified** |
| **Caption vs. AI Explainer Check** | Stepping `$12,500 → $15,000` updates qualifying count from `73` to `277` (`+204`). Both the local verified summary and live Gemini (`gemini-3.5-flash-lite`) / OpenAI (`gpt-4o-mini`) responses cite verified fact IDs, state the exact `+204` gain, and identify `Chevrolet Equinox` (`81/345`, `23.5%`) as the leading non-Ford fit without hallucinating prices. | **Verified** |

### Confusing Labels Caught & Revised During Dry Run
1. **View 2 (`index.html`, `v2_spread.js`):** Replaced `"interquartile range"` / `"Pool n"` / `"Q25–Q75"` with plain-English **`"middle 50% of prices"`**, **`"Listings"`**, and **`"25th pct"` / `"75th pct"`** for shoppers unfamiliar with statistics terms.
2. **View 5 (`index.html`, `v5_gaps.js`):** Replaced `"strata"` / `"Stratum gap"` with **`"matching year & mileage groups"`** and **`"Price gap"`** so non-technical shoppers immediately understand the comparison.
3. **Masthead Trust Strip (`main.js`):** Changed `"Source:" / "Dates:" / "Cohort:"` to **`"Data source:"` / `"Listing dates:"` / `"Sample size:"`** so Task 3 answers jump off the top of the page.
4. **View 9 (`index.html`):** Clarified `"load its MPG in View 8"` to **`"highlight that exact car in View 4 and estimate its yearly fuel cost in View 8."`**

---

## 5. Human Pilot Results Log (Record Without Names)

| Participant | Task 1 (Non-Ford) | Task 2 (Trade-off) | Task 3 (Source/Date) | Time (sec) | Help Needed? | Trust Score (`1–6`) | Caption vs. AI Preference | Anonymous Comment (Clear / Confusing) |
|---|---|---|---|---|---|---|---|---|
| P1 *(pending human test)* | | | | | | | | |
| P2 *(pending human test)* | | | | | | | | |
| P3 *(pending human test)* | | | | | | | | |
| P4 *(pending human test)* | | | | | | | | |
| P5 *(pending human test)* | | | | | | | | |

---

## 6. Post-Pilot Revision Checklist
- [ ] Summarize completion rate (`X / 5` unaided), median time, and mean Trust Score.
- [ ] Identify the single most common point of confusion across the 5 comments.
- [ ] Revise the unclear label, control, or caption in the relevant `v*.js` or `explainer.js` file.
- [ ] Repeat the affected task(s) on the revised version and report before/after evidence in the final presentation.
