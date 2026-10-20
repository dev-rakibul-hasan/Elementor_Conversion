# Team Integration & Module Boundaries Handoff

> **Author:** Mubasshir (Backend API & Architecture Lead)  
> **Status:** Authoritative Contract & Boundary Guidelines  
> **Rule:** Strict Zero Merge Conflict & Interface Invariance

---

## 1. Team Responsibilities & Direct Ownership

| Team Member | Module Boundary | Primary Handoff Interface | Forbidden Modifications |
|---|---|---|---|
| **Mubasshir**| `server/src/contracts/*`, `server/src/modules/dir/*`, `server/src/modules/orchestration/*` | Authoritative contracts, validated DIR schema, Pipeline Orchestrator & status mapping | Storage internals, Elementor widget internals, Frontend UI, Skillset files |
| **Rakib** *(Storage)* | `server/src/modules/storage/*`, upload routes | Implements `IUploadStorageAdapter` (`validateUpload`, `isolateCanvas`) | Canonical DIR schema, orchestrator, Elementor generator |
| **Provash** *(Elementor)* | `server/src/modules/elementor/*`, `wordpress-plugin/*` | Implements `IElementorCompilerAdapter` & `IElementorHealingAdapter` | Canonical DIR schema ownership, upload validation, frontend |
| **Safaet** *(Frontend)* | `client/src/*` | Consumes `CreateJobRequest`, `GetJobResponse`, `StageProgressInfo` | Modifying backend types, inventing untyped status names |
| **Diya** *(Skillset & QA)*| `server/ELEMENTOR_SKILL.md`, QA fixtures | Fixture files matching canonical DIR v1.0.0 and Elementor AST rules | Modifying runtime pipeline or orchestrator logic |

---

## 2. Integration Adapters for Each Teammate

### 2.1 For Rakib: `IUploadStorageAdapter`
```typescript
import type {
  Stage1UploadValidationInput,
  Stage1UploadValidationOutput,
} from './registry.js';

export interface IUploadStorageAdapter {
  validateUpload(input: Stage1UploadValidationInput): Promise<Stage1UploadValidationOutput>;
  isolateCanvas?(filePath: string): Promise<DIRCanvasBounds>;
}
```
**Rakib's Responsibilities:**
- Receive `Stage1UploadValidationInput` containing `filePath`, `mimeType`, and `sizeBytes`.
- Run magic byte checks and SHA-256 computation.
- Verify dimensions with `sharp`.
- Return `Stage1UploadValidationOutput` containing `verifiedSha256`, `verifiedWidth`, `verifiedHeight`, and `storagePath`.

---

### 2.2 For Provash: `IElementorCompilerAdapter` & `IElementorHealingAdapter`
```typescript
import type {
  Stage5ElementorGenerationInput,
  Stage5ElementorGenerationOutput,
} from './registry.js';
import type { NativeElementorTemplate } from '../../contracts/api.js';
import type { DIRDocument } from '../dir/types.js';

export interface IElementorCompilerAdapter {
  compileToElementor(
    input: Stage5ElementorGenerationInput,
    signal?: AbortSignal
  ): Promise<Stage5ElementorGenerationOutput>;
}

export interface IElementorHealingAdapter {
  healElementor(
    template: NativeElementorTemplate,
    syntaxErrors: string[],
    referenceDIR: DIRDocument,
    attempt: number,
    signal?: AbortSignal
  ): Promise<NativeElementorTemplate>;
}
```
**Provash's Responsibilities:**
- Read the validated `DIRDocument` from `input.validatedDIRDocument`.
- Compile each section into modern Flexbox Containers (`elType: "container"`). Never emit legacy sections or columns.
- Map DIR nodes to native Elementor Core 4.3.5 widget profiles.
- When `healElementor` is called by Stage 6 gate, patch syntax/layout errors and return a compliant template.

---

### 2.3 For Safaet: Frontend 7-Stage Tracker Integration
```typescript
import type {
  GetJobResponse,
  StageProgressInfo,
  PipelineStage,
  JobStatus,
} from './contracts/index.js';
```
**Safaet's Responsibilities:**
- Poll `GET /api/v1/jobs/:id` every 2 seconds.
- Render the 7 stages using `stages[stageKey]`:
  1. `upload_validation`: Upload & Security
  2. `image_analysis`: Stage A - Vision & Canvas Isolation
  3. `dir_generation`: Stage B - Canonical DIR Schema
  4. `dir_validation`: DIR Contract Verification
  5. `elementor_generation`: Stage C - Elementor AST Generator
  6. `elementor_validation`: Stage D - Self-Healing Quality Gate
  7. `preview_rendering`: Preview & QA Inspection
- Bind retry button to `POST /api/v1/jobs/:id/retry` with `resumeFromStage`.

---

### 2.4 For Diya: Skillset & QA Fixtures
**Diya's Responsibilities:**
- Maintain `server/ELEMENTOR_SKILL.md` aligned with canonical DIR Schema v1.0.0.
- Ensure all sample JSON fixtures adhere strictly to `DIRDocument` schema:
  - Bounding boxes are numeric and within image dimensions.
  - No string dimensions in styles (`24`, never `"24px"`).
  - Background colors declared for dark theme pages (`#050a04`).
