# Pipeline Orchestration, Checkpoint/Resume & Self-Healing Architecture

> **Architecture Owner:** Mubasshir (Backend API & Architecture Lead)  
> **Source Module:** `server/src/modules/orchestration/orchestrator.ts`  
> **Registry Definition:** `server/src/modules/orchestration/registry.ts`

---

## 1. The Seven Authoritative Pipeline Stages

The conversion pipeline strictly executes in topological order:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 1: upload_validation (Security & Dimensions Check)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 2: image_analysis (Stage A: Vision Perception & Canvas Isolation)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 3: dir_generation (Stage B: Semantic DIR Layout Synthesis)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 4: dir_validation (DIR Contract Verification & Self-Repair Gate) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 5: elementor_generation (Stage C: Elementor AST Compilation)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 6: elementor_validation (Stage D: Self-Healing Quality Gate)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Stage 7: preview_rendering (Preview QA & Readiness Inspection)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Stage Descriptors Matrix

| Stage | Key | Weight | Timeout | Max Retries | Gate Type |
|---|---|---|---|---|---|
| **1. Upload Validation** | `upload_validation` | 5% | 15s | 1 | Precondition |
| **2. Image Analysis** | `image_analysis` | 20% | 90s | 2 | Perception |
| **3. DIR Generation** | `dir_generation` | 25% | 90s | 2 | Synthesis |
| **4. DIR Validation** | `dir_validation` | 10% | 30s | 2 | **Self-Repair Gate** |
| **5. Elementor Gen** | `elementor_generation` | 20% | 45s | 2 | Compilation |
| **6. Elementor Validation**| `elementor_validation` | 10% | 45s | 2 | **Self-Healing Gate** |
| **7. Preview QA** | `preview_rendering` | 10% | 30s | 2 | Quality Sign-off |

---

## 2. Checkpoint & Resume Architecture

Re-running failed jobs must never re-trigger expensive or slow multimodal Vision AI calls if valid intermediate representations already exist.

### Checkpoint Storage Contract (`IJobCheckpointStore`)
- When any stage completes successfully, its typed output is persisted to the checkpoint store via `saveStageCheckpoint(jobId, stage, output, attempt)`.
- When a retry is requested (`POST /api/v1/jobs/:id/retry`), the orchestrator checks existing stage checkpoints in topological order.
- If Stage 1, 2, and 3 checkpoints exist, the orchestrator reuses their verified outputs and directly resumes execution at Stage 4 or 5.
- Cached checkpoints undergo schema verification before reuse. If a cached checkpoint fails verification, the orchestrator falls back to fresh execution for that stage.

---

## 3. Bounded Retries & Timeouts

### 3.1 Per-Stage Timeouts
Each stage runs within an isolated `AbortController` boundary with a configured timer:
- Stage 1: 15,000ms
- Stage 2: 90,000ms
- Stage 3: 90,000ms
- Stage 4: 30,000ms
- Stage 5: 45,000ms
- Stage 6: 45,000ms
- Stage 7: 30,000ms

If a stage exceeds its limit, the timer aborts the handler's `signal` and raises `StageTimeoutError`.

### 3.2 Bounded Exponential Backoff
- Each stage attempts up to `maxRetries + 1` executions.
- Transient errors delay subsequent attempts using exponential backoff:
  $$\Delta t = \min(100 \cdot 2^{\text{attempt}}, 1000)\,\text{ms}$$
- Non-retryable errors (such as fatal schema validation rejections or unauthorized access) abort immediately without cycling through retry attempts.
- If all attempts fail, the orchestrator raises `RetryLimitExceededError` and marks the job and stage as `'failed'`.

---

## 4. Self-Healing Coordination

The orchestrator coordinates two distinct self-healing gates:

### 4.1 Stage 4: DIR Self-Repair Gate
- **Trigger:** Zod runtime validation finds syntax or schema defects in AI-synthesized DIR.
- **Protocol:**
  1. Orchestrator invokes `validateDIR(rawDoc)`.
  2. If invalid, attempts deterministic `normalizeDIRDocument` normalization.
  3. If still invalid and `IDIRRepairAdapter` is registered, orchestrator invokes `dirRepair.repairDIR(doc, validationIssues, attempt)`.
  4. Repaired output is re-validated against canonical DIR schema.
  5. Upon success, stage completes with `selfHealed: true`. If healing attempts exhaust, fails with `StageValidationError`.

### 4.2 Stage 6: Elementor AST Self-Healing Gate
- **Trigger:** Compiled Elementor template AST violates Core 4.3.5 rules (e.g., emits legacy `elType: "section"` instead of `container`, or missing widget slugs).
- **Protocol:**
  1. Orchestrator executes `validateElementorTemplateStructure(template)`.
  2. If syntax errors exist, invokes `IElementorHealingAdapter.healElementor(template, syntaxErrors, referenceDIR, attempt)`.
  3. Re-validates the patched template.
  4. Upon success, stage completes with `selfHealed: true`.

---

## 5. Idempotency & Concurrency Locks

- Jobs submitted with an `idempotencyKey` are registered in the checkpoint store.
- Re-submitting the same key returns the existing job record with `isIdempotentReplay: true`, preventing redundant pipeline runs.
- Concurrent workers claim job locks via `claimJobLock(jobId, workerId, ttlMs)`. If a lock is held by another worker, conflicting executions are rejected with `IdempotencyConflictError`.

