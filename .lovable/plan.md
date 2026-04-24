
# 🧠 Data Quality Engine — Implementation Plan

## Goal
Insert a **Data Quality (DQ) gate** between Excel upload and dashboard rendering. Validate every row against 4 layers of rules, tag each row (`CLEAN` / `WARNING` / `ERROR` / `CRITICAL`), quarantine bad rows into an Error Sheet, and only pass usable rows downstream. **Existing KPI math stays untouched** — we just feed it a cleaner dataset.

---

## Architecture

```
Excel Upload
    ↓
[Layer 1] Structural Validation  → REJECT FILE if mandatory columns missing
    ↓
[Layer 2] Mandatory Field Check  → ERROR rows quarantined
    ↓
[Layer 3] Business Logic Checks  → tag CRITICAL / ERROR / WARNING per rule
    ↓
[Layer 4] RCM Performance Checks → outliers, ratio anomalies, dept consistency
    ↓
DQ Report Modal (user reviews + chooses to proceed)
    ↓
computeGlobals(cleanRows)  ← only CLEAN + WARNING rows
```

---

## New Files

### 1. `src/lib/dq-engine.ts` (core engine, ~300 lines)
Pure functions, no React. Exports:

```ts
export type Severity = 'clean' | 'warning' | 'error' | 'critical';

export interface RowFlag {
  rowIndex: number;
  severity: Severity;
  layer: 1 | 2 | 3 | 4;
  rule: string;        // e.g. "approved_gt_claimed"
  message: string;     // human readable
  field?: string;
}

export interface DQReport {
  fileRejected: boolean;
  rejectReason?: string;
  totalRows: number;
  cleanRows: number;
  warningRows: number;
  errorRows: number;
  criticalRows: number;
  flagsByRule: Record<string, number>;
  rowFlags: Map<number, RowFlag[]>;   // rowIndex → flags
  cleanData: ClaimRecord[];           // CLEAN + WARNING (passed to dashboard)
  quarantined: { record: ClaimRecord; flags: RowFlag[] }[];
  layerSummary: { layer: number; checks: number; failed: number }[];
}

export function runDataQuality(rawRows: any[], parsed: ClaimRecord[]): DQReport;
```

**Layer 1 — Structural** (operates on raw header keys):
- Required headers: `Claim No`, `Patient Name`, `Admission Date`, `Claimed Amount`, `Status` (use same fuzzy matcher as parser)
- Duplicate header detection
- If any missing → `fileRejected = true`, return early

**Layer 2 — Mandatory fields** (per row):
- Hard stops (→ `error`, quarantined): blank Claim No, blank Patient Name, missing Admission Date, claimedAmt ≤ 0, blank Status
- Soft warnings (→ `warning`, kept): missing IP No, missing Discharge Date, missing TPA, missing Policy No

**Layer 3 — Business logic** (per row):
- **Financial**: `claimedAmt ≥ approvedAmt ≥ settledAmt`; no negatives; approvedAmt > claimedAmt → `critical`
- **Date logic**: admission ≤ discharge; claimDate ≥ discharge; paymentDate ≥ claimDate → `critical` if violated
- **TAT**: no submission > 3 days = warning; no approval > 10 days = error; no settlement > 30 days = critical
- **Zero approval intelligence**: approvedAmt = 0 AND age > 7 days → `critical` ("High Risk Claim")
- **Process events**: missing submission/payment/discharge → `warning` "PROCESS FAILURE"
- **Duplicates**: same Claim No → `error`; same Patient + Admission + ClaimedAmt → `error`

**Layer 4 — Performance**:
- Outliers: claimedAmt > ₹10L flagged for review (warning)
- Closed status with settled = 0 → `error`
- TAT > 3× median → `warning`
- Ratio sanity (aggregate, not row-level): approval rate < 70%, denial > 15%, avg TAT > 30 days → surface as **report-level alerts** (not row flags)
- Treatment/amount mismatch: configurable map (cataract > ₹2L, dialysis < ₹50k flagged) — start with a small built-in dictionary, extendable later

### 2. `src/components/dashboard/DataQualityModal.tsx` (~250 lines)
Shown automatically after upload, before dashboard renders. Sections:

- **Header**: file name, total rows, gate status (✅ Pass / ⚠️ Warnings / ❌ Rejected)
- **4 Layer Cards**: each shows checks performed, failed count, top 3 rules violated
- **Severity breakdown donut**: Clean / Warning / Error / Critical counts
- **Top Issues table**: rule, count, sample row, severity badge
- **Quarantined Rows table**: paginated, with reason column, Excel-export button (uses `xlsx` already installed)
- **Action buttons**:
  - `Proceed with Clean Data (N rows)` — primary
  - `Download Error Sheet (.xlsx)` — exports quarantined rows + flag column
  - `Re-upload File` — back to upload screen
- If `fileRejected`: only show rejection reason + Re-upload button (no proceed option)

### 3. `src/components/dashboard/DataQualityBadge.tsx` (~60 lines)
Small persistent badge in `DashboardLayout` top bar showing:
- `🟢 Data Quality: 94%` (cleanRows / totalRows)
- Click → re-opens DQ Modal as a read-only review

---

## Modified Files

### `src/contexts/DashboardContext.tsx`
- Add state: `dqReport: DQReport | null`, `dqModalOpen: boolean`, `rawRows: any[]`
- Modify `handleFileUpload`:
  ```ts
  const raw = parseRawSheet(buffer);          // new helper, returns raw json rows
  const parsed = parseExcelFile(buffer);      // existing
  const report = runDataQuality(raw, parsed);
  setDqReport(report);
  setDqModalOpen(true);
  if (report.fileRejected) return;            // don't compute globals
  // Wait for user to click Proceed → then:
  // setGlobalData(computeGlobals(report.cleanData))
  ```
- New action `proceedAfterDQ()` triggered by modal's Proceed button

### `src/lib/rcm-data.ts`
- Export a small helper `parseRawSheet(buffer): any[]` (just the `XLSX.utils.sheet_to_json` step) so DQ engine can inspect raw headers/values BEFORE coercion strips evidence of corruption (e.g., negative numbers parsed as 0)
- No change to `parseExcelFile` or `computeGlobals` — keeps existing formulas/numbers identical

### `src/components/UploadScreen.tsx`
- After upload, `DataQualityModal` mounts on top (controlled by context). UploadScreen logic untouched.

### `src/pages/Index.tsx`
- Render `<DataQualityModal />` once inside `DashboardProvider` so it can show on top of either UploadScreen or Dashboard

### `src/components/dashboard/DashboardLayout.tsx`
- Add `<DataQualityBadge />` next to existing Theme button in top bar

---

## Excel Error Sheet Export
Reuse `xlsx` library:
- Sheet 1: `Quarantined Rows` — original columns + `DQ_Severity`, `DQ_Rules`, `DQ_Messages`
- Sheet 2: `Summary` — counts per rule, per layer
- Filename: `DQ_Errors_<originalName>.xlsx`

---

## Guarantees (no regressions)
1. `computeGlobals` receives the same `ClaimRecord[]` shape it does today — just filtered. All existing tabs (TAT, AR, Denial, Cash Flow, DSO, Profitability, Corporate, MoM) keep their exact formulas.
2. If user clicks Proceed without quarantining anything (e.g. all clean), behavior is byte-identical to today.
3. DQ engine is **pure / side-effect-free** — easy to unit test, no UI coupling.

---

## Out of scope (future)
- Per-rule editable thresholds UI (currently hardcoded constants in `dq-engine.ts`, easy to externalize later)
- Auto-fix suggestions (e.g., swap admission/discharge if reversed)
- Server-side persistence of DQ history across uploads

---

## Files to create (3)
- `src/lib/dq-engine.ts`
- `src/components/dashboard/DataQualityModal.tsx`
- `src/components/dashboard/DataQualityBadge.tsx`

## Files to edit (4)
- `src/contexts/DashboardContext.tsx`
- `src/lib/rcm-data.ts` (export `parseRawSheet` helper only)
- `src/pages/Index.tsx`
- `src/components/dashboard/DashboardLayout.tsx`

Approve to implement.
