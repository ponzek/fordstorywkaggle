#!/usr/bin/env python3
"""
verify.py -- independent pandas/NumPy verification against core.js (via Node).
Writes verification_report.md and verification.js for the Methodology section.
"""
import json
import os
import pathlib
import subprocess
import sys

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parent
CLI = ROOT / "core_cli.js"
CSV = ROOT / "data" / "processed" / "reese_clean.csv"
results = []


def node(req):
    env = os.environ.copy()
    env.pop("OPENSSL_CONF", None)
    out = subprocess.run(["node", str(CLI)], input=json.dumps(req), capture_output=True, text=True, cwd=ROOT, env=env)
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    return json.loads(out.stdout)


def check(cid, kind, desc, expected, actual, tol=1e-6):
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        ok = abs(expected - actual) <= tol * max(1.0, abs(expected))
    else:
        ok = expected == actual
    results.append({"id": cid, "kind": kind, "desc": desc, "expected": expected, "actual": actual, "ok": bool(ok)})
    print(f"[{'PASS' if ok else 'FAIL'}] {cid} {desc}: expected={expected!r} actual={actual!r}")


df = pd.read_csv(CSV, keep_default_na=False)
df["year"] = df["year"].astype(int)
df["miles"] = df["miles"].astype(int)
df["price"] = df["price"].astype(int)


def band_idx(m):
    return 0 if m <= 0 else min(4, (m - 1) // 25000)


df["band"] = df["miles"].map(band_idx)

# C0: Row count == 1,633 (or matches processed CSV)
js_rows = node({"cmd": "rows"})
check("C0", "setup", "cleaned Craigslist row count [pandas vs app]", int(len(df)), js_rows)

# N1: Default $15,000 counts (277 eligible, 148 non-Ford, 4 at cap)
elig15 = df[df["price"] <= 15000]
non_ford15 = int((elig15["model"] != "Ford Escape").sum())
at_cap15 = int((df["price"] == 15000).sum())
js15 = node({"cmd": "eligible_summary", "opts": {}, "budget": 15000})
check("N1a", "numerical", "eligible listings at $15,000 [pandas vs app]", int(len(elig15)), js15["eligible"])
check("N1b", "numerical", "non-Ford listings at $15,000 [pandas vs app]", non_ford15, js15["nonFord"])
check("N1c", "numerical", "listings exactly at $15,000 cap [pandas vs app]", at_cap15, js15["atCap"])

# N2: Model in-budget count & share at $15,000
js_spread = {r["model"]: r for r in node({"cmd": "spread", "opts": {}, "budget": 15000})}
for model in ["Ford Escape", "Chevrolet Equinox"]:
    sub = df[df["model"] == model]
    pd_q = int((sub["price"] <= 15000).sum())
    pd_t = int(len(sub))
    pd_pct = round(100.0 * pd_q / pd_t, 1) if pd_t else None
    js_pct = round(js_spread[model]["pct"], 1) if js_spread[model]["pct"] is not None else None
    check(f"N2_{model.split()[1]}", "numerical", f"{model} in-budget count & share at $15,000",
          [pd_q, pd_t, pd_pct], [js_spread[model]["qualify"], js_spread[model]["n"], js_pct])

# N3: Budget delta $12,500 -> $15,000 (73 -> 277, +204)
pd_125 = int((df["price"] <= 12500).sum())
js_sum = node({"cmd": "summary", "state": {
    "budget": 15000, "models": ["Ford Escape", "Chevrolet Equinox", "Honda CR-V", "Toyota RAV4", "Nissan Rogue"],
    "focusModel": "Ford Escape", "yearMin": 2016, "yearMax": 2019, "mileMin": 0, "mileMax": 125000, "gapMinN": 15
}, "prevBudget": 12500})
check("N3", "numerical", "budget raise $12,500 -> $15,000 delta [pandas vs app]",
      [pd_125, int(len(elig15)), int(len(elig15)) - pd_125],
      [js_sum["prevEligCount"], js_sum["eligibleCount"], js_sum["budgetDelta"]])

# N4: Fuel formula 12,000 mi/yr at 25 MPG and $3.50/gal = $1,680
js_fuel = node({"cmd": "fuel_cost", "miles": 12000, "mpg": 25, "price": 3.5})
check("N4", "numerical", "annual fuel cost (12,000 mi/yr, 25 MPG, $3.50/gal)", 1680.0, js_fuel["annualDollars"])

# N5: Matched price gaps vs Ford Escape (cutoff 15, plus sensitivity 10 and 20)
def pd_matched_gap(alt_model, cutoff):
    esc = df[df["model"] == "Ford Escape"]
    alt = df[df["model"] == alt_model]
    diffs = []
    for yr in [2016, 2017, 2018, 2019]:
        for b in range(5):
            e_sub = esc[(esc["year"] == yr) & (esc["band"] == b)]["price"]
            a_sub = alt[(alt["year"] == yr) & (alt["band"] == b)]["price"]
            if len(e_sub) >= cutoff and len(a_sub) >= cutoff:
                diffs.append(float(a_sub.median() - e_sub.median()))
    return (len(diffs), round(float(np.mean(diffs)), 2) if diffs else None)


for cutoff in [15, 10, 20]:
    js_gaps = {g["model"]: g for g in node({"cmd": "gaps", "opts": {}, "minPerSide": cutoff})}
    for alt_model in ["Chevrolet Equinox", "Honda CR-V", "Toyota RAV4", "Nissan Rogue"]:
        pd_sc, pd_g = pd_matched_gap(alt_model, cutoff)
        js_g = round(js_gaps[alt_model]["gap"], 2) if js_gaps[alt_model]["gap"] is not None else None
        if cutoff == 15 or alt_model == "Chevrolet Equinox":
            check(f"N5_c{cutoff}_{alt_model.split()[-1]}", "numerical",
                  f"matched gap vs Escape ({alt_model}, min={cutoff}/side)",
                  [pd_sc, pd_g], [js_gaps[alt_model]["strataCount"], js_g])

# N6: Combined regional share adds counts first then divides
esc_df = df[df["model"] == "Ford Escape"]
js_reg = node({"cmd": "regions", "opts": {}, "model": "Ford Escape", "budget": 15000})
check("N6", "numerical", "regional combined total adds counts first (Escape at $15k)",
      [int((esc_df["price"] <= 15000).sum()), int(len(esc_df))],
      [js_reg["combined"]["qualify"], js_reg["combined"]["total"]])

# B1: $0 budget cap shows 0% for groups with listings and 0 shortlist rows
js_zero = node({"cmd": "spread", "opts": {}, "budget": 0})
check("B1", "boundary", "$0 budget cap gives 0% for Escape without error",
      [0, "0.0%"], [js_zero[0]["qualify"], js_zero[0]["shareLabel"]])

# B2: Empty model selection shows No listings match / 0 rows without division by zero
js_empty = node({"cmd": "spread", "opts": {"models": []}, "budget": 15000})
check("B2", "boundary", "empty model selection returns 'No listings match' with 0 rows",
      [], js_empty)
js_empty_sum = node({"cmd": "summary", "state": {"budget": 15000, "models": []}})
check("B2b", "boundary", "empty model summary has poolCount = 0", 0, js_empty_sum["poolCount"])

# B3: Reversed mileage range returns validation error
js_rev = node({"cmd": "validate", "opts": {"mileMin": 80000, "mileMax": 20000}})
check("B3", "boundary", "reversed mileage range (80k > 20k) triggers validation message", False, js_rev["ok"])

# B4: Blank/missing condition preserved as Unknown
pd_unk = int((df["condition"] == "Unknown").sum())
js_cond = {b["condition"]: b["count"] for b in node({"cmd": "condition_mix", "opts": {}, "budget": 60000})["bars"]}
check("B4", "boundary", "missing condition preserved as 'Unknown' [pandas vs app]", pd_unk, js_cond["Unknown"])

# B5: Invalid fuel input (> 30,000 mi or > 100 MPG) rejected cleanly
js_fuel_bad = node({"cmd": "fuel_cost", "miles": 40000, "mpg": 25, "price": 3.5})
check("B5", "boundary", "out-of-range fuel input (40,000 mi/yr) returns ok=False", False, js_fuel_bad["ok"])

# S1-S4: Verified summary & local caption behavior in normal, empty, $0-cap, and invalid states (Table II)
s_norm = node({"cmd": "summary", "state": {"budget": 15000, "models": ["Ford Escape", "Chevrolet Equinox", "Honda CR-V", "Toyota RAV4", "Nissan Rogue"], "yearMin": 2016, "yearMax": 2019, "mileMin": 0, "mileMax": 125000}, "prevBudget": 12500})
exp_elig15 = int(len(elig15))
exp_delta = exp_elig15 - pd_125
alt_shares = []
for alt_m in ["Chevrolet Equinox", "Honda CR-V", "Toyota RAV4", "Nissan Rogue"]:
    sub = df[df["model"] == alt_m]
    if len(sub):
        alt_shares.append((alt_m, int((sub["price"] <= 15000).sum()) / len(sub)))
best_alt_model = max(alt_shares, key=lambda x: x[1])[0] if alt_shares else ""
check("S1_normal", "summary", f"normal $15k summary produces valid counts, {exp_delta:+d} delta, and best-case scenario",
      [True, exp_elig15, exp_delta, True],
      [s_norm["valid"], s_norm["eligibleCount"], s_norm["budgetDelta"], bool(best_alt_model) and (best_alt_model in s_norm["bestCase"])])

s_empty = node({"cmd": "summary", "state": {"budget": 15000, "models": [], "yearMin": 2016, "yearMax": 2019, "mileMin": 0, "mileMax": 125000}})
check("S2_empty", "summary", "empty model selection produces 'No listings match' caption",
      [True, 0, True], [s_empty["valid"], s_empty["poolCount"], s_empty["localCaption"].startswith("No listings match")])

s_zero = node({"cmd": "summary", "state": {"budget": 0, "models": ["Ford Escape", "Chevrolet Equinox"], "yearMin": 2016, "yearMax": 2019, "mileMin": 0, "mileMax": 125000}})
check("S3_zero_cap", "summary", "$0 budget cap produces 0 eligible listings and 0.0% caption",
      [True, 0, True], [s_zero["valid"], s_zero["eligibleCount"], "0.0%" in s_zero["localCaption"]])

s_inv = node({"cmd": "summary", "state": {"budget": 15000, "models": ["Ford Escape"], "yearMin": 2016, "yearMax": 2019, "mileMin": 90000, "mileMax": 20000}})
check("S4_invalid", "summary", "reversed mileage range produces invalid state with error caption",
      [False, True], [s_inv["valid"], "invalid" in s_inv["localCaption"].lower()])

passed = sum(1 for r in results if r["ok"])
total = len(results)
print(f"\n{passed}/{total} checks passed.")

report = [
    "# Verification report",
    "",
    f"{passed} of {total} checks passed. Generated by `verify.py` (independent pandas/NumPy calculations vs `core.js` run through Node).",
    "",
    "| id | type | check | expected | app / actual | result |",
    "|---|---|---|---|---|---|",
]
for r in results:
    report.append(f"| {r['id']} | {r['kind']} | {r['desc']} | `{r['expected']}` | `{r['actual']}` | {'PASS' if r['ok'] else 'FAIL'} |")
(ROOT / "verification_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
(ROOT / "verification.js").write_text(
    "window.VERIFY = " + json.dumps({"passed": passed, "total": total, "results": results}) + ";\n",
    encoding="utf-8",
)
sys.exit(0 if passed == total else 1)
