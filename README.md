# Design-to-Elementor — Autonomous AI Conversion Studio

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.1-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-darkblue.svg)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0.5-yellow.svg)](https://vitest.dev/)

**Design-to-Elementor** is an enterprise-grade automated compiler and AI conversion pipeline that translates visual UI designs, screenshots, and mockups into native, fully editable **WordPress Elementor 3.x / 4.x Flexbox Container JSON structures**. The system operates through a deterministic 4-stage pipeline (Vision Analysis, Structural DIR Synthesis, Elementor Compilation, and Fidelity Review) backed by an asynchronous PostgreSQL job queue, local/Backblaze B2 storage, and remote publishing via the official **Elementor Model Context Protocol (MCP)** interface.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Complete Execution Workflow](#2-complete-execution-workflow)
3. [UML Activity Diagrams](#3-uml-activity-diagrams)
   - [3.1 End-to-End Conversion Pipeline Flow](#31-end-to-end-conversion-pipeline-flow)
   - [3.2 Background Worker & Optimistic Lease Management](#32-background-worker--optimistic-lease-management)
   - [3.3 DIR Schema Validation, Normalization & Targeted Repair](#33-dir-schema-validation-normalization--targeted-repair)
   - [3.4 Remote WordPress MCP Publishing & Two-Phase Fallback](#34-remote-wordpress-mcp-publishing--two-phase-fallback)
4. [Module Relationships & Data Flow Matrix](#4-module-relationships--data-flow-matrix)
5. [Detailed Module & Component Reference](#5-detailed-module--component-reference)
   - [5.1 Storage Engine & Image Processing](#51-storage-engine--image-processing)
   - [5.2 AI Engine, Routing & Model Capabilities](#52-ai-engine-routing--model-capabilities)
   - [5.3 Design Intermediate Representation (DIR)](#53-design-intermediate-representation-dir)
   - [5.4 Elementor 3.x Generator & Compiler](#54-elementor-3x-generator--compiler)
   - [5.5 Model Context Protocol (MCP) WordPress Bridge](#55-model-context-protocol-mcp-wordpress-bridge)
   - [5.6 Database Schema, Concurrency & Transactions](#56-database-schema-concurrency--transactions)
   - [5.7 Frontend Client Application](#57-frontend-client-application)
6. [Error Handling, Resilience & Recovery Policies](#6-error-handling-resilience--recovery-policies)
7. [Configuration & Environment Variables](#7-configuration--environment-variables)
8. [Developer Setup & Quickstart Guide](#8-developer-setup--quickstart-guide)
9. [Systematic Debugging & Troubleshooting Guide](#9-systematic-debugging--troubleshooting-guide)
10. [Test Suites & Quality Verification](#10-test-suites--quality-verification)

---

## 1. System Architecture Overview

The codebase is organized as a decoupled TypeScript full-stack monorepo with an Express REST API backend, an asynchronous worker daemon, and a Next.js 16 React 19 frontend:

```mermaid
graph TB
    subgraph Client ["Frontend Client (client/) — Next.js 16 App Router & React 19"]
        UI_Dash["Dashboard (/)"]
        UI_Upload["Upload Intake (/upload)"]
        UI_Project["Project Inspector (/projects/:id)"]
        UI_Publish["Publish Studio (/projects/:id/publish)"]
        UI_Settings["Site Connections (/settings)"]
        API_Layer["Axios API Client (src/lib/api.ts)"]
        Auth_Store["Zustand Auth Store (src/store/auth.ts)"]
    end

    subgraph Server_API ["API Server (server/src/index.ts) — Express 4.21"]
        MW_Sec["Security Middleware (Helmet, CORS, RateLimit)"]
        MW_Auth["Auth Middleware (requireAuth, getAuthenticatedUserId)"]
        MW_Upload["Multer Upload Middleware (MemoryBuffer)"]
        Routes_Auth["Auth Routes (/api/v1/auth)"]
        Routes_Upload["Upload Routes (/api/v1/upload)"]
        Routes_Projects["Project Routes (/api/v1/projects)"]
        Routes_Jobs["Job Routes (/api/v1/jobs)"]
        Routes_Sites["Site & Publish Routes (/api/v1/sites)"]
        Storage_Static["Static Storage Handler (/storage/*)"]
    end

    subgraph Worker ["Conversion Worker Daemon (server/src/worker.ts)"]
        Worker_Loop["Polling Loop (FOR UPDATE SKIP LOCKED)"]
        Heartbeat["Lease Heartbeat (30s interval, 3m expiry)"]
        Orchestrator["Conversion Orchestrator (orchestrator.ts)"]
    end

    subgraph Pipeline ["4-Stage AI Pipeline (server/src/modules/conversion/)"]
        Stage_Vision["Stage 1: Vision Analysis (Gemini Flash)"]
        Stage_Struct["Stage 2: Structure Synthesis (Groq / GPT-OSS)"]
        Stage_Repair["DIR Repair & Asset Bounds (asset-bounds.ts)"]
        Stage_Gen["Stage 3: Elementor Compilation (generator.ts)"]
        Stage_Review["Stage 4: Fidelity Review (Claude 3.5 Sonnet)"]
        Quality_Gate["Deterministic Quality Gate"]
    end

    subgraph Core_Services ["Core Engine Services (server/src/modules/)"]
        AI_Router["AI Router & Capabilities (modules/ai/)"]
        AI_Cache["7-Factor Composite Cache (modules/ai/cache.ts)"]
        Storage_Engine["Storage Adapters: Local / B2 (modules/storage/)"]
        Image_Proc["Sharp Processor: Tiling & Cropping (image-processor.ts)"]
        Elementor_Compiler["Elementor Serializer & Validator (modules/elementor/)"]
        MCP_Bridge["MCP Client & Publisher (modules/mcp/)"]
    end

    subgraph Storage_Layer ["Data & Storage Layer"]
        Postgres[("PostgreSQL 15+ (Prisma ORM)")]
        Local_FS[("./storage/uploads/ (Local Adapter)")]
        Backblaze_B2[("Backblaze B2 S3 (Cloud Adapter)")]
    end

    subgraph External_WP ["Target WordPress Site (WordPress 6.8+ / Elementor 4.3+)"]
        WP_Core["WordPress REST API"]
        WP_Bridge["Elementor MCP Bridge Plugin (elementor-mcp-bridge.php)"]
    end

    %% Interactions
    UI_Dash & UI_Upload & UI_Project & UI_Publish & UI_Settings --> API_Layer
    API_Layer -->|HTTP Bearer JWT| Server_API
    Server_API --> MW_Sec --> MW_Auth
    MW_Upload --> Image_Proc
    Routes_Upload --> Storage_Engine
    Routes_Upload --> Postgres
    Routes_Projects & Routes_Jobs & Routes_Sites --> Postgres
    Worker_Loop -->|Poll queued jobs| Postgres
    Worker_Loop --> Orchestrator
    Orchestrator --> Stage_Vision --> Stage_Struct --> Stage_Repair --> Stage_Gen --> Stage_Review --> Quality_Gate
    Stage_Vision & Stage_Struct & Stage_Review --> AI_Router
    AI_Router --> AI_Cache
    Stage_Repair --> Image_Proc --> Storage_Engine
    Stage_Gen --> Elementor_Compiler
    Quality_Gate -->|Update job artifacts| Postgres
    Routes_Sites --> MCP_Bridge -->|JSON-RPC over HTTP| WP_Bridge --> WP_Core
    Storage_Engine --> Local_FS & Backblaze_B2
```

---

## 2. Complete Execution Workflow

The end-to-end execution of a design conversion follows five distinct architectural phases:

```
[Phase 1: Intake & Storage] ➔ [Phase 2: Queuing & Worker Lease] ➔ [Phase 3: 4-Stage Conversion Engine] ➔ [Phase 4: Quality Gate] ➔ [Phase 5: MCP Remote Publishing]
```

### Phase 1: Upload Intake & Sanitization
1. **Client Action:** The user selects or drags a design mockup (`.png`, `.jpg`, `.jpeg`) into the Dropzone at `/upload`.
2. **API Intake:** The client transmits a `multipart/form-data` POST request to `/api/v1/upload`.
3. **Authentication Check:** [`requireAuth`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/auth.ts) verifies the JWT in the `Authorization: Bearer <token>` header and [`getAuthenticatedUserId`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/auth.ts) extracts the validated `userId`.
4. **Buffer Extraction:** Multer parses the file into an in-memory `Buffer` (`uploadMiddleware.fields`).
5. **Magic Bytes Validation:** [`checkMagicBytes(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) validates file signatures (`0x89504E47` for PNG, `0xFFD8FFE0/E1` for JPEG) to prevent malicious executable uploads disguised as images.
6. **Decompression Bomb Guard:** [`validateImage(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) invokes Sharp to inspect dimensions and ensures `width * height <= 100,000,000` (100 Megapixel limit), throwing `ValidationError` if exceeded.
7. **Orientation Normalization:** [`normalizeImageOrientation(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) strips EXIF rotation metadata and bakes orientation into the raw raster buffer.
8. **Storage Accounting:** Within a Prisma transaction, [`reserveStorage(tx, userId, fileBytes)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/accounting.ts) checks whether `user.usedStorage + fileBytes > user.storageQuota`. If quota is exceeded, an `AppError('Storage quota exceeded', 413, 'STORAGE_QUOTA_EXCEEDED')` is thrown.
9. **Asset Persistence:** The adapter ([`LocalStorageAdapter`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/local.ts) or [`B2StorageAdapter`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/b2.ts)) writes the file to `projects/:projectId/originals/:uuid_:fileName`.
10. **Database Records:** An `Asset` record and a `ConversionJob` with status `'queued'`, `attempts: 0`, and `maxAttempts: 3` are atomically created.

### Phase 2: Asynchronous Job Queuing & Lease Management
1. **Background Polling:** The standalone worker daemon ([`server/src/worker.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/worker.ts)) continuously polls the PostgreSQL database.
2. **Optimistic Row Locking:** `acquireJob()` executes an atomic raw query:
   ```sql
   SELECT id FROM "ConversionJob"
   WHERE status = 'queued' AND "deletingAt" IS NULL
   ORDER BY "createdAt" ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
   ```
3. **Lease Acquisition:** The worker marks `status = 'processing'`, sets its unique `workerId`, records `lockedAt = NOW()`, sets `leaseExpiresAt = NOW() + 3 minutes`, and increments `attempts = attempts + 1`.
4. **Heartbeat Timer:** A background timer runs every 30 seconds (`HEARTBEAT_INTERVAL_MS`), updating `lastHeartbeat = NOW()` and extending `leaseExpiresAt` by 3 minutes to prevent timeout while AI stages are running.
5. **Stale Lease Reaper:** Every polling cycle, any job with `status = 'processing'` where `leaseExpiresAt < NOW()` is reclaimed. If `attempts < maxAttempts`, it resets to `'queued'`; otherwise, it transitions to `'failed'`.

### Phase 3: The 4-Stage AI Conversion Engine
[`ConversionOrchestrator.runJob(jobId)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/orchestrator.ts) coordinates the execution across four sequential stages:

#### Stage 1: Vision Layout Analysis (`vision_analysis`)
- **Tiling Engine:** If the source image is tall (height > 2400px), [`createTiles(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) produces vertical strips with a 200px boundary overlap so section headers spanning seams are not missed.
- **Provider Resolution:** Resolves `VISION_AI_PROVIDER` (default `gemini`, model `gemini-3.8-flash`).
- **Capability Check:** Enforces that the model supports image inputs (`supportsVision: true`).
- **Cache Check:** Computes a 7-factor composite SHA-256 hash ([`computeStageCacheKey`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/cache.ts)). If a matching `StageCache` record exists with complete output, the LLM request is bypassed.
- **Output:** An intermediate structured JSON document detailing visual sections, grid columns, color palettes, typography hierarchies, and component bounding boxes.

#### Stage 2: Structural DIR Synthesis (`structure_synthesis`)
- **Provider Resolution:** Resolves `STRUCTURE_AI_PROVIDER` (default `groq`, model `openai/gpt-oss-120b`).
- **Capability Stripping:** Text-only models automatically have raster attachments stripped before dispatch to prevent provider API rejections.
- **Synthesis:** The AI generates a comprehensive **Design Intermediate Representation (DIR)** document conforming to the canonical schema.
- **Validation & Auto-Repair:**
  - The JSON is validated against [`dirDocumentSchema`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/schema.ts).
  - If schema validation fails, [`normalizeDIRDocument`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/normalizer.ts) performs deterministic recovery (fixing numeric conversions, defaulting semantic tags, fixing missing IDs).
  - If normalization cannot resolve errors, a targeted section-level AI repair prompt is executed.
- **Asset Bounds Reconciliation:** [`reconcileAssetBounds(dir, imageBuffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/asset-bounds.ts) locates image nodes with pixel-coordinate `sourceRect` definitions, uses Sharp to crop individual logos, badges, and graphics from the source image, uploads them to storage, and replaces `sourceRect` with permanent relative storage URLs.

#### Stage 3: Elementor 3.x Compilation (`elementor_generation`)
- **Deterministic Compiler:** [`ElementorGenerator.generate(dirDocument)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/generator.ts) converts DIR nodes into Elementor 3.x/4.x Flexbox containers and Core widgets.
- **Container Semantics:** Maps DIR sections into root containers (`elType: 'container'`), converting flex directions (`row`, `column`), wrap states, align items, justify content, and percentage/pixel widths.
- **Widget Translation:** Maps 20+ DIR element types to native Elementor widgets:
  - `heading` -> Elementor `heading` (`title`, `header_size`, typography styling)
  - `text` / `paragraph` -> Elementor `text-editor` (`editor` HTML content)
  - `button` -> Elementor `button` (`text`, `link`, `button_type`, colors, radius)
  - `image` -> Elementor `image` (`image.url`, dimensions)
  - `icon` / `icon_box` -> Elementor `icon-box` (`icon`, `title_text`, `description_text`)
  - `card` / `container` -> Nested Flexbox `container`
- **ID Generation:** Assigns unique 8-character hexadecimal IDs (`generateElementId()`) to every container and widget.
- **Responsive Profiles:** Computes desktop, tablet, and mobile styles using [`responsive-capabilities.json`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/responsive-capabilities.json).

#### Stage 4: Fidelity Review & Quality Gate (`fidelity_review`)
- **Reviewer:** `REVIEW_AI_PROVIDER` (default `openrouter`, model `anthropic/claude-3.5-sonnet`) evaluates the compiled structure against visual requirements.
- **Content Audit:** [`auditContentFidelity(dir, elementor)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/content-audit.ts) extracts text strings and verifies no headings or body copy were lost during compilation.
- **Deterministic Quality Gate:**
  - Verifies DIR contains at least 1 section and > 0 nodes.
  - Verifies Elementor document contains at least 1 root container and registered widgets.
  - Verifies all image widgets contain populated image URLs.
- **Completion:** Job status is updated to `'preview_ready'`, storing `dirArtifact`, `elementorArtifact`, and `previewArtifact` in the database.

### Phase 4: Frontend Live Inspection & Polling
1. The client project page (`/projects/:id`) polls `/api/v1/projects/:id/job` every 2 seconds.
2. The Stage Progress component ([`stage-progress.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/components/conversion/stage-progress.tsx)) displays real-time progress indicators, duration, and token usage for each stage.
3. Upon completion, the interactive **DIR Inspector** ([`dir-inspector.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/components/conversion/dir-inspector.tsx)) renders a browsable DOM tree of sections, nodes, and styling rules.
4. Users can download the native Elementor Template JSON file for direct import into the WordPress Elementor Editor (`Import Template` dialog).

### Phase 5: Remote WordPress Publishing via MCP
1. **Connection Setup:** The user registers a target WordPress site in `/settings`, providing the site URL, WordPress username, and an Application Password.
2. **Encrypted Storage:** The API encrypts credentials using AES-256-GCM ([`encrypt(json)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/security/encryption.ts)) and stores them in `SiteConnection`.
3. **Publish Trigger:** The user navigates to `/projects/:id/publish`, selects the target site and post title, and clicks **Publish to WordPress**.
4. **MCP Handshake:** [`MCPClient`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/client.ts) connects to the WordPress site's MCP bridge endpoint and performs capability discovery (`tools/list`).
5. **Two-Phase Publication:**
   - *Primary:* If `elementor_create_page` tool is discovered, creates the page and attaches the Elementor container tree in one operation.
   - *Fallback:* If only core tools are discovered, calls `wp_create_post` to create a draft page ID, followed by `elementor_set_post_data` to set `_elementor_data`, `_elementor_edit_mode = 'builder'`, and `_elementor_template_type = 'wp-page'`.
6. **Read-Back Verification:** The client calls `elementor_get_post_data` or `wp_get_post` to confirm that the container tree was successfully persisted in WordPress post meta.

---

## 3. UML Activity Diagrams

### 3.1 End-to-End Conversion Pipeline Flow

The following UML Activity Diagram illustrates the complete execution path, conditional branches, error checks, and quality gates from intake to final output:

```mermaid
flowchart TD
    Start([User uploads design mockup]) --> ValidateIntake{Magic bytes & 100MP check}
    
    ValidateIntake -- Invalid signature or >100MP --> RejectUpload[Throw ValidationError 400]
    RejectUpload --> EndFailed([End: Request Rejected])
    
    ValidateIntake -- Valid --> CheckQuota{User storage quota exceeded?}
    CheckQuota -- Exceeded --> RejectQuota[Throw StorageError 413]
    RejectQuota --> EndFailed
    
    CheckQuota -- Within Quota --> SaveStorage[Persist original image in Local/B2 Storage]
    SaveStorage --> CreateJob[Create Asset & ConversionJob in DB: status = queued]
    CreateJob --> NotifyClient[Return 201 Created with jobId]
    
    NotifyClient --> WorkerPoll[Worker acquires job: FOR UPDATE SKIP LOCKED]
    WorkerPoll --> StartHeartbeat[Start 30s lease heartbeat pulse]
    
    StartHeartbeat --> CheckTile{Image height > 2400px?}
    CheckTile -- Yes --> GenerateTiles[Generate overlapping vertical tiles]
    CheckTile -- No --> SingleImage[Use full image buffer]
    
    GenerateTiles --> VisionStage[Stage 1: Vision Analysis via Gemini Flash]
    SingleImage --> VisionStage
    
    VisionStage --> CheckVisionCache{7-Factor cache hit in DB?}
    CheckVisionCache -- Hit --> LoadVisionCache[Load cached vision JSON]
    CheckVisionCache -- Miss --> CallVisionAI[Invoke Gemini API with vision prompt]
    CallVisionAI --> StoreVisionCache[Cache vision output]
    StoreVisionCache --> SynthStage[Stage 2: Structure Synthesis via Groq]
    LoadVisionCache --> SynthStage
    
    SynthStage --> ValidateDIR{DIR Schema Zod validation}
    ValidateDIR -- Fails validation --> NormalizeDIR[Execute deterministic normalizer]
    NormalizeDIR --> RecheckDIR{Schema valid now?}
    RecheckDIR -- No --> AIRepair[Execute targeted section AI repair]
    AIRepair --> ValidateDIR
    
    RecheckDIR -- Yes --> ReconcileBounds[Reconcile asset bounds & crop logos/graphics]
    ValidateDIR -- Valid --> ReconcileBounds
    
    ReconcileBounds --> CompileElementor[Stage 3: Elementor 3.x Generator]
    CompileElementor --> InjectSkill[Inject responsive capabilities & SKILL.md]
    InjectSkill --> ValidateElementor{Validate container nesting & widget registry}
    
    ValidateElementor -- Validation Error --> CompilationFailure[Throw CompilationError]
    CompilationFailure --> RetryLogic{Attempt < MaxAttempts?}
    
    ValidateElementor -- Valid --> ReviewStage[Stage 4: Fidelity Review via Claude 3.5]
    ReviewStage --> QualityGate{Deterministic Quality Gate: >0 nodes & images populated}
    
    QualityGate -- Failed --> RetryLogic
    RetryLogic -- Yes --> ResetQueued[Reset status = queued, clear lease, wait backoff]
    ResetQueued --> WorkerPoll
    RetryLogic -- No --> FailJob[Set status = failed with error details]
    FailJob --> EndFailed
    
    QualityGate -- Passed --> MarkReady[Set status = preview_ready with artifacts]
    MarkReady --> StopHeartbeat[Stop heartbeat timer]
    StopHeartbeat --> ReadyState([Job Ready for Download or Publish])
    
    ReadyState --> PublishRequest{User clicks Publish to WordPress}
    PublishRequest -- No --> EndDone([End: Template JSON Downloaded])
    
    PublishRequest -- Yes --> MCPHandshake[MCP Client initializes connection & discovers tools]
    MCPHandshake --> CheckTools{elementor_create_page tool available?}
    
    CheckTools -- Yes --> DirectPublish[Execute elementor_create_page tool]
    CheckTools -- No --> FallbackPublish[Execute wp_create_post then elementor_set_post_data]
    
    DirectPublish --> ReadbackVerify{Read back created page from WordPress}
    FallbackPublish --> ReadbackVerify
    
    ReadbackVerify -- Containers match --> MarkPublished[Set job status = published with live URL]
    ReadbackVerify -- Mismatch or Error --> ThrowMCP[Throw MCPError & rollback]
    
    MarkPublished --> EndSuccess([End: Published Successfully])
    ThrowMCP --> EndFailed
```

---

### 3.2 Background Worker & Optimistic Lease Management

The worker daemon executes concurrency-limited processing using PostgreSQL atomic row locks:

```mermaid
flowchart TD
    subgraph WorkerDaemon ["Worker Polling Daemon (server/src/worker.ts)"]
        W_Start([Worker Process Started]) --> W_Reap[Check for expired worker leases: leaseExpiresAt <= NOW]
        W_Reap --> W_Reclaim{Expired jobs found?}
        W_Reclaim -- Yes --> W_CheckAttempts{attempts < maxAttempts?}
        W_CheckAttempts -- Yes --> W_ResetQueued[Reset to status = queued, workerId = null]
        W_CheckAttempts -- No --> W_MarkFailed[Set status = failed: Worker lease expired]
        W_Reclaim -- No --> W_Slots{Active slots < CONVERSION_WORKER_CONCURRENCY?}
        W_ResetQueued --> W_Slots
        W_MarkFailed --> W_Slots
        
        W_Slots -- No --> W_Sleep[Sleep POLL_INTERVAL_MS = 2000ms]
        W_Sleep --> W_Reap
        
        W_Slots -- Yes --> W_Query[Execute: SELECT FOR UPDATE SKIP LOCKED]
        W_Query --> W_Found{Job row returned?}
        W_Found -- No --> W_Sleep
        
        W_Found -- Yes --> W_Acquire[Set status = processing, lockedAt = NOW, leaseExpiresAt = NOW + 3m]
        W_Acquire --> W_Spawn[Spawn runJob in background slot]
        W_Spawn --> W_Heartbeat[Start 30s Heartbeat Timer]
        
        W_Heartbeat --> W_Pulse[Pulse: UPDATE leaseExpiresAt = NOW + 3m, lastHeartbeat = NOW]
        W_Pulse --> W_JobFinished{Job completed or thrown?}
        W_JobFinished -- No --> W_WaitPulse[Wait 30s] --> W_Pulse
        
        W_JobFinished -- Yes --> W_ClearTimer[Clear Heartbeat Timer]
        W_ClearTimer --> W_SlotFree[Decrement active slot count]
        W_SlotFree --> W_Reap
    end
```

---

### 3.3 DIR Schema Validation, Normalization & Targeted Repair

The DIR subsystem guarantees that invalid AI output never crashes the Elementor compiler:

```mermaid
flowchart TD
    subgraph DIR_Processing ["DIR Pipeline (modules/dir/)"]
        RawAI[Raw AI Output JSON String] --> JSONParse{Valid JSON Syntax?}
        
        JSONParse -- No --> ExtractJSON[Regex extract largest bracketed JSON block]
        ExtractJSON --> JSONParse2{Valid JSON now?}
        JSONParse2 -- No --> ParseFail[Throw ValidationError: Malformed JSON output]
        
        JSONParse -- Yes --> ZodCheck{dirDocumentSchema.safeParse}
        JSONParse2 -- Yes --> ZodCheck
        
        ZodCheck -- Success --> ReturnValid[Return validated DIRDocument]
        
        ZodCheck -- Failure --> Normalizer[Invoke normalizeDIRDocument]
        Normalizer --> Norm_Sections[Ensure sections array exists & has valid roles]
        Norm_Sections --> Norm_Nodes[Recursively assign UUIDs, default styles, coerce numbers]
        Norm_Nodes --> Norm_CSS[Normalize CSS units, flexbox props, color hexes]
        Norm_CSS --> Revalidate{Schema valid after normalization?}
        
        Revalidate -- Yes --> ReturnValid
        
        Revalidate -- No --> SectionRepair[Section-Level AI Repair Loop]
        SectionRepair --> IdentifyBad[Isolate specific invalid sections and Zod issues]
        IdentifyBad --> PromptRepair[Prompt AI with targeted section repair prompt]
        PromptRepair --> RepairParse{Repaired section validates?}
        RepairParse -- Yes --> SpliceSection[Splice repaired section back into DIR document]
        SpliceSection --> FinalCheck{Full document validates?}
        FinalCheck -- Yes --> ReturnValid
        FinalCheck -- No --> FailRepair[Throw ValidationError: DIR repair exhausted]
        RepairParse -- No --> FailRepair
    end
```

---

### 3.4 Remote WordPress MCP Publishing & Two-Phase Fallback

The MCP publishing bridge communicates with remote WordPress instances over Model Context Protocol:

```mermaid
flowchart TD
    subgraph MCP_Publishing ["WordPress MCP Publishing Bridge (modules/mcp/)"]
        Req[POST /api/v1/publish with jobId & siteConnectionId] --> LoadSite[Load SiteConnection from DB]
        LoadSite --> DecryptCreds[AES-256-GCM decrypt application password]
        DecryptCreds --> InitClient[Initialize MCPClient with siteUrl & credentials]
        
        InitClient --> TestConn{client.testConnection: Endpoint reachable?}
        TestConn -- No --> ConnErr[Throw MCPError: WordPress site unreachable]
        
        TestConn -- Yes --> DiscTools[Discover tools via tools/list]
        DiscTools --> HasCreatePage{elementor_create_page tool present?}
        
        HasCreatePage -- Yes --> Direct[Call tool: elementor_create_page]
        Direct --> CheckDirectRes{result.isError == true?}
        CheckDirectRes -- No --> ExtractPageID[Extract created WordPress post ID]
        CheckDirectRes -- Yes --> CheckCanFallback{wp_create_post tool available?}
        
        HasCreatePage -- No --> FallbackPhase1[Call tool: wp_create_post title, status=draft]
        CheckCanFallback -- Yes --> FallbackPhase1
        CheckCanFallback -- No --> DirectFailed[Throw MCPError with WordPress message]
        
        FallbackPhase1 --> CheckDraftRes{Draft page created?}
        CheckDraftRes -- No --> DraftFailed[Throw MCPError: Failed to create draft post]
        
        CheckDraftRes -- Yes --> FallbackPhase2[Call tool: elementor_set_post_data with container tree]
        FallbackPhase2 --> CheckDataSet{elementor_set_post_data succeeded?}
        CheckDataSet -- No --> RollbackPost[Call wp_delete_post to clean up draft]
        RollbackPost --> SetFailed[Throw MCPError: Failed to attach Elementor data]
        
        CheckDataSet -- Yes --> ExtractPageID
        
        ExtractPageID --> Readback[Verify page: call elementor_get_post_data or wp_get_post]
        Readback --> VerifyContainers{Returned containers match expected count?}
        VerifyContainers -- No --> WarnMismatch[Log warning: container count mismatch]
        VerifyContainers -- Yes --> SuccessPublish[Update job status = published, store page URL]
        WarnMismatch --> SuccessPublish
        SuccessPublish --> Done([Return 200 OK with live page URL])
    end
```

---

## 4. Module Relationships & Data Flow Matrix

The table below outlines how data moves across system boundaries, specifying producers, consumers, and data types:

| Producer Module | Consumer Module | Data Transferred | Schema / Interface | Transport Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **`client/src/app/upload`** | `server/src/routes/upload.ts` | Multipart form data (Image buffer, name) | `multipart/form-data` | HTTP POST (Axios) |
| **`routes/upload.ts`** | `modules/storage/image-processor.ts` | Raw image buffer | `Buffer` | In-memory function call |
| **`modules/storage/image-processor.ts`** | `modules/storage/local.ts` / `b2.ts` | Validated buffer & MIME type | `Buffer`, `string` | Method call (`upload`) |
| **`routes/upload.ts`** | PostgreSQL (`prisma.conversionJob`) | Queued job record | `ConversionJob` | Prisma ORM Transaction |
| **PostgreSQL** | `server/src/worker.ts` | Locked job record for processing | `ConversionJob` | Atomic SQL `FOR UPDATE SKIP LOCKED` |
| **`worker.ts`** | `modules/conversion/orchestrator.ts` | Job ID & concurrency slot | `string`, `WorkerSlot` | Asynchronous invocation |
| **`orchestrator.ts`** | `modules/ai/router.ts` | Prompt text, image parts, stage role | `AIRequestOptions` | Method call (`executeRequest`) |
| **`modules/ai/router.ts`** | Gemini / Groq / OpenRouter APIs | Role-tailored system/user prompts | HTTP JSON / Multi-part | External HTTPS REST |
| **AI Provider** | `modules/dir/normalizer.ts` | Raw synthesized DIR JSON string | `string` | Return value |
| **`normalizer.ts`** | `modules/conversion/asset-bounds.ts` | Validated DIR Document | `DIRDocument` | In-memory object |
| **`asset-bounds.ts`** | `modules/storage/` | Cropped sub-asset buffers (logos, icons) | `Buffer`, `string` | Method call (`upload`) |
| **`modules/conversion/asset-bounds.ts`** | `modules/elementor/generator.ts` | Reconciled DIR Document with asset URLs | `DIRDocument` | In-memory object |
| **`modules/elementor/generator.ts`** | `modules/elementor/validator.ts` | Elementor 3.x container tree | `ElementorDocument` | In-memory object |
| **`orchestrator.ts`** | PostgreSQL (`prisma.conversionJob`) | Final artifacts (`dir`, `elementor`, `preview`) | `JsonValue` | Prisma update (`status = 'preview_ready'`) |
| **`server/src/routes/sites.ts`** | `modules/mcp/publisher.ts` | Site connection & Elementor document | `SiteConnection`, `ElementorDocument` | Method call (`publish`) |
| **`modules/mcp/publisher.ts`** | Target WordPress Site | JSON-RPC tool invocations | MCP Protocol JSON-RPC | External HTTPS POST / SSE |

---

## 5. Detailed Module & Component Reference

### 5.1 Storage Engine & Image Processing
- **Location:** [`server/src/modules/storage/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/)
- **Core Files:**
  - [`local.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/local.ts): Local filesystem implementation. Uses `getSafePath(key)` to prevent path traversal attacks by normalizing leading slashes and asserting paths remain strictly within `LOCAL_STORAGE_PATH`.
  - [`b2.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/b2.ts): S3-compatible Backblaze B2 cloud storage adapter utilizing `@aws-sdk/client-s3`.
  - [`factory.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/factory.ts): Singleton factory returning either `LocalStorageAdapter` or `B2StorageAdapter` based on `STORAGE_PROVIDER`.
  - [`image-processor.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts): Sharp-based raster image processing.
    - `checkMagicBytes(buffer)`: Validates PNG/JPEG/WEBP file signatures.
    - `validateImage(buffer)`: Enforces `MAX_PIXELS_LIMIT = 100_000_000` (100MP decompression bomb guard).
    - `normalizeImageOrientation(buffer)`: Auto-rotates image according to EXIF and strips metadata.
    - `createTiles(buffer)`: Generates vertical overlapping slices for tall landing pages.
    - `cropSubAsset(buffer, rect)`: Extracts pixel-bounded regions for discrete graphics.
  - [`accounting.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/accounting.ts): Manages user storage quotas with PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).

### 5.2 AI Engine, Routing & Model Capabilities
- **Location:** [`server/src/modules/ai/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/)
- **Core Files:**
  - [`router.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/router.ts): Dynamic provider router. Supports `gemini`, `groq`, `openrouter`, and `mock`. Manages provider cooldowns (e.g. on HTTP 429) and routes stage roles (`vision`, `structure`, `review`) to their designated providers.
  - [`capabilities.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/capabilities.ts): Model capability guard. Maintains a registry of known vision-capable models (e.g. `gemini-3.8-flash`, `claude-3.5-sonnet`) versus text-only models (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`). Automatically strips raster parts when dispatching to text-only models.
  - [`cache.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/cache.ts): 7-factor composite SHA-256 caching engine (`StageCache` table in PostgreSQL). Skips caching if output was truncated (`finishReason: 'length'`).
  - [`providers/gemini.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/gemini.ts): Native Google Gemini adapter supporting inline image parts, exponential backoff on HTTP 503, and `Retry-After` header adherence.
  - [`providers/groq.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/groq.ts): High-throughput OpenAI-compatible Groq adapter.
  - [`providers/openrouter.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/openrouter.ts): Multi-model gateway adapter supporting Anthropic, Meta, and Mistral models.

### 5.3 Design Intermediate Representation (DIR)
- **Location:** [`server/src/modules/dir/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/)
- **Core Files:**
  - [`schema.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/schema.ts): Authoritative Zod schema definition for `DIRDocument`, `DIRMeta`, `DIRGlobals`, `DIRSection`, and 26 distinct `DIRNode` variants (`heading`, `paragraph`, `button`, `image`, `container`, etc.).
  - [`normalizer.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/normalizer.ts): Deterministic AST normalizer. Resolves invalid numeric values, assigns fallback UUIDs, coerces CSS units (`px`, `%`, `rem`), maps color strings to standard hex format, and ensures container hierarchies are well-formed.
  - [`types.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/types.ts): TypeScript type definitions inferred directly from the Zod schema.

### 5.4 Elementor 3.x Generator & Compiler
- **Location:** [`server/src/modules/elementor/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/)
- **Core Files:**
  - [`generator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/generator.ts): The primary compilation engine. Recursively traverses the DIR tree and outputs native Elementor Flexbox Containers (`elType: 'container'`) and Core widgets (`elType: 'widget'`). Assigns 8-character hex IDs, maps typography styles to Elementor typography controls, and configures flex wrap/direction.
  - [`serializer.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/serializer.ts): Serializes the compiled structure into the official Elementor Template JSON schema (`v0.4`). Injects operative rules from [`server/src/skills/elementor/SKILL.md`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/SKILL.md).
  - [`validator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/validator.ts): Structural validator ensuring element ID uniqueness, valid container nesting depth, and registered widget type conformance.
  - [`consistency-validator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/consistency-validator.ts): Cross-validates generated Elementor controls against the responsive profile rules defined in [`responsive-capabilities.json`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/responsive-capabilities.json).

### 5.5 Model Context Protocol (MCP) WordPress Bridge
- **Location:** [`server/src/modules/mcp/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/)
- **Core Files:**
  - [`client.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/client.ts): Low-level MCP JSON-RPC transport client. Handles endpoint handshaking, tool listing (`tools/list`), tool invocation (`tools/call`), error parsing (`result.isError`), and timeout management.
  - [`publisher.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/publisher.ts): High-level publishing orchestrator. Implements two-phase publication (direct `elementor_create_page` or fallback `wp_create_post` + `elementor_set_post_data`), followed by read-back validation.
  - [`wordpress-plugin/elementor-mcp-bridge.php`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/wordpress-plugin/elementor-mcp-bridge.php): Companion WordPress plugin that exposes the Elementor MCP tools over JSON-RPC, authenticating requests via WordPress Application Passwords.

### 5.6 Database Schema, Concurrency & Transactions
- **Location:** [`server/prisma/schema.prisma`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/prisma/schema.prisma)
- **Entities:**
  - `User`: Accounts, hashed credentials, storage usage, and quota limits (`storageQuota`).
  - `Project`: Project namespaces, descriptions, soft-deletion timestamp (`deletingAt`).
  - `Asset`: Physical files stored in Local/B2, SHA-256 hashes, pixel dimensions, MIME types.
  - `ConversionJob`: State machine (`queued` -> `processing` -> `preview_ready` -> `publishing` -> `published` / `failed` / `cancelled`), lease expiration (`leaseExpiresAt`), heartbeat timestamp (`lastHeartbeat`), retry counter (`attempts`), and JSON artifacts (`dirArtifact`, `elementorArtifact`).
  - `JobStage`: Granular telemetry per stage (stage name, attempt number, status, duration in ms, token usage, error messages).
  - `StageCache`: 7-factor composite hash cache entries preventing redundant LLM calls.
  - `SiteConnection`: WordPress connection records, encrypted application passwords (`encryptedCredentials`), discovered MCP capabilities.
- **Safety Guards:**
  - Deletion Guard: Projects undergoing deletion acquire row locks (`SELECT ... FOR UPDATE`), check that no job is currently `publishing`, set `deletingAt`, cancel queued jobs, remove physical files, synchronize quota, and purge database rows atomically.

### 5.7 Frontend Client Application
- **Location:** [`client/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/)
- **Framework & Libraries:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React, Framer Motion, TanStack Query, Zustand.
- **Core Pages & Components:**
  - [`src/app/layout.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/layout.tsx): Root layout with font imports, theme init script, and `suppressHydrationWarning` on `<body>` to neutralize browser extension DOM mutations.
  - [`src/app/globals.css`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/globals.css): Tailwind CSS v4 theme entry point with unnested `:root` and `.dark` variables for universal Webpack and Turbopack compatibility.
  - [`src/app/upload/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/upload/page.tsx): Drag-and-drop file upload with instant blob inspection preview.
  - [`src/app/projects/[id]/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/projects/[id]/page.tsx): Main conversion workspace featuring real-time stage progress polling, DIR tree visualizer, Elementor raw JSON viewer, and template download.
  - [`src/app/projects/[id]/publish/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/projects/[id]/publish/page.tsx): WordPress publishing interface with target site selector and status streaming.
  - [`src/app/settings/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/settings/page.tsx): WordPress MCP connection manager with instant connection testing.

---

## 6. Error Handling, Resilience & Recovery Policies

The system enforces a standardized error hierarchy defined in [`server/src/lib/errors.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/lib/errors.ts):

| Error Class | HTTP Status | Error Code | Description / Recovery Policy |
| :--- | :--- | :--- | :--- |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Schema validation failure (Zod payload mismatch, bad parameters). Returns field-level error details. |
| `AuthError` | 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | Missing/expired JWT, invalid credentials, or role mismatch. Directs user to re-authenticate. |
| `NotFoundError` | 404 | `NOT_FOUND` | Project, Job, Asset, or Site connection does not exist or belongs to another user. |
| `StorageError` | 400 / 500 / 413 | `STORAGE_ERROR` / `STORAGE_QUOTA_EXCEEDED` | File resolution failure, path traversal attempt blocked, or user storage quota exceeded. |
| `AIProviderError` | 502 / 503 / 504 / 429 | `AI_PROVIDER_ERROR` | LLM API error. Flags `isRetryable = true` for transient 503/429/timeouts with exponential backoff. |
| `CompilationError` | 422 | `COMPILATION_ERROR` | DIR-to-Elementor translation failure. Triggers automated section-level repair loop. |
| `MCPError` | 502 | `MCP_ERROR` | WordPress JSON-RPC bridge error. Attempts two-phase fallback before failing. |
| `AppError` | 409 | `JOB_BUSY` / `PROJECT_CHANGED` | Concurrency violation (e.g. attempting to delete project while publishing is active). |

### Transient Failure & Backoff Algorithm
For AI provider errors (e.g. Gemini 503 Service Unavailable or 429 Rate Limit):
1. The provider checks `err.status` or `err.code`.
2. If `Retry-After` header is present, it sleeps for the specified duration.
3. Otherwise, it calculates jittered exponential backoff:
   $$\text{backoffMs} = \min(\text{initialDelayMs} \times 2^{\text{attempt}}, \text{maxDelayMs}) + \text{randomJitter}$$
4. If retries are exhausted on the primary provider, `AIRouter` temporarily puts the provider in a cooldown state and routes to a fallback provider if configured.

---

## 7. Configuration & Environment Variables

### Server Configuration (`server/.env`)

```ini
# Application Environment
NODE_ENV=development                    # development | production | test
API_PORT=4000                           # Port for Express API server
TRUST_PROXY_HOPS=0                      # Number of upstream reverse proxy hops (e.g. Nginx)
WEB_ORIGIN=http://localhost:3000        # Allowed CORS origin for client requests

# Database & Security
DATABASE_URL=postgresql://postgres:password@localhost:5432/design_to_elementor
JWT_SECRET=super-secret-development-jwt-token-key-32-chars-long  # Min 32 characters in production
SITE_CREDENTIAL_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 64-char hex key

# Storage Configuration
STORAGE_PROVIDER=local                  # local | b2
LOCAL_STORAGE_PATH=./storage/uploads    # Directory for local asset uploads
UPLOAD_MAX_BYTES=524288000              # Maximum upload size (500 MB)
UPLOAD_QUOTA_BYTES=2147483648           # Default per-user storage quota (2 GB)

# Backblaze B2 (Required only if STORAGE_PROVIDER=b2)
B2_BUCKET_NAME=design-to-elementor
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_APPLICATION_KEY_ID=your-b2-key-id
B2_APPLICATION_KEY=your-b2-app-key

# Primary AI Configuration
AI_PROVIDER=groq                        # Primary default provider: groq | gemini | openrouter | mock
AI_API_KEY=your-groq-api-key            # Primary API key
AI_MODEL=openai/gpt-oss-120b            # Default model name
AI_REQUEST_TIMEOUT_MS=60000             # HTTP request timeout for LLM calls (60s)

# Dedicated AI Providers
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash
ENABLE_GEMINI=true

OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Stage-Specific Role Routing
VISION_AI_PROVIDER=gemini               # Provider for Stage 1 (must support vision)
VISION_AI_MODEL=gemini-3.8-flash
STRUCTURE_AI_PROVIDER=groq              # Provider for Stage 2 (DIR synthesis)
STRUCTURE_AI_MODEL=openai/gpt-oss-120b
REVIEW_AI_PROVIDER=openrouter           # Provider for Stage 4 (Fidelity review)
REVIEW_AI_MODEL=anthropic/claude-3.5-sonnet

# Pollinations AI (Image generation fallback)
POLLINATIONS_ENDPOINT=https://image.pollinations.ai/prompt
POLLINATIONS_MODEL=flux
ENABLE_POLLINATIONS=true
POLLINATIONS_TIMEOUT_MS=30000
POLLINATIONS_MAX_RETRIES=2

# Conversion Worker Daemon
CONVERSION_WORKER_CONCURRENCY=2         # Maximum concurrent conversion jobs
CONVERSION_MAX_ATTEMPTS=3               # Maximum retry attempts before marking job failed
RUN_LIVE_AI_TESTS=false                 # Set true only when running live LLM integration tests
```

### Client Configuration (`client/.env.local`)

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

---

## 8. Developer Setup & Quickstart Guide

### Prerequisites
- **Node.js:** `>= 22.12.0`
- **npm:** `>= 10.0.0`
- **PostgreSQL:** `>= 15.0` running locally or accessible via network
- **Native Build Tools:** Python and C++ build tools (required for Sharp native bindings)

### Installation & Initialization

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Elementor_Conversion
   ```

2. **Setup Server:**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env and configure your DATABASE_URL and AI API keys
   npx prisma db push
   ```

3. **Setup Client:**
   ```bash
   cd ../client
   npm install
   ```

### Running the Development Environment

To run the complete system, launch the API server, the background worker daemon, and the Next.js frontend in separate terminal windows:

- **Terminal 1 — API Server:**
  ```bash
  cd server
  npm run dev
  # Server starts on http://localhost:4000
  ```

- **Terminal 2 — Background Conversion Worker:**
  ```bash
  cd server
  npm run worker
  # Worker daemon starts polling for queued jobs
  ```

- **Terminal 3 — Frontend Web Application:**
  ```bash
  cd client
  npm run dev
  # Next.js starts on http://localhost:3000
  ```

---

## 9. Systematic Debugging & Troubleshooting Guide

### 1. Request Tracing with `X-Request-Id`
Every incoming HTTP request is assigned a unique UUID by [`requestIdMiddleware`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/requestId.ts).
- This ID is returned in the `X-Request-Id` response header.
- All Pino log entries generated during that request include `reqId: "..."`.
- **Action:** When a client reports an error, locate the `X-Request-Id` from their network tab and search the server logs:
  ```bash
  grep "reqId.*<uuid>" server.log
  ```

### 2. Inspecting Intermediate Conversion Artifacts
If a conversion job produces unexpected Elementor layouts:
1. Open the job in the database:
   ```sql
   SELECT id, status, "errorMessage", "dirArtifact", "elementorArtifact"
   FROM "ConversionJob" WHERE id = 'your-job-id';
   ```
2. Inspect the `dirArtifact` JSON:
   - Check `sections`: Are all page sections identified?
   - Check `nodes`: Are text, headings, and images properly classified?
   - Check `sourceRect`: Are pixel coordinates within the image bounds?
3. Inspect `JobStage` records to see stage-by-stage telemetry:
   ```sql
   SELECT stage, status, "durationMs", "tokensUsed", "errorMessage"
   FROM "JobStage" WHERE "jobId" = 'your-job-id' ORDER BY "attempt" ASC, "createdAt" ASC;
   ```

### 3. Diagnosing AI Model Rejections
- **Symptom:** AI request fails with `400 Bad Request` or `Model does not support vision`.
- **Cause:** A text-only model (e.g. `openai/gpt-oss-120b`) was assigned to a vision stage, or image parts were not stripped.
- **Verification:** Check [`capabilities.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/capabilities.ts). Ensure `VISION_AI_PROVIDER` is set to `gemini` or a model registered with `supportsVision: true`.

### 4. Diagnosing WordPress MCP Connection Failures
- **Symptom:** Clicking "Test Connection" in `/settings` fails with `MCPError: WordPress site unreachable` or `401 Unauthorized`.
- **Checklist:**
  1. Verify the companion plugin `elementor-mcp-bridge.php` is active in `wp-admin/plugins.php`.
  2. Verify the site URL begins with `https://` (or `http://` for local testbeds).
  3. Verify Application Passwords are enabled in WordPress (`Users` -> `Profile` -> `Application Passwords`).
  4. Test raw connectivity via curl:
     ```bash
     curl -i -u "username:app_password" https://example.com/wp-json/mcp-bridge/v1/health
     ```

### 5. Resolving Client Hydration Warnings
- **Symptom:** React hydration mismatch logged in the browser console mentioning `cz-shortcut-listen` or `data-new-gr-c-s-check-loaded`.
- **Cause:** Browser extensions (ColorZilla, Grammarly) inject attributes into `<body>` before React hydrates.
- **Solution:** Verify `suppressHydrationWarning` is present on both `<html lang="en" suppressHydrationWarning>` and `<body suppressHydrationWarning ...>` in [`client/src/app/layout.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/layout.tsx).

---

## 10. Test Suites & Quality Verification

The repository maintains automated test suites covering unit logic, integration flows, and compiler fidelity:

### Server Verification (`server/`)
```bash
cd server

# Run full automated test suite (30 test suites, 290 tests)
npm test -- --run

# Run TypeScript typecheck (Must exit 0 with 0 errors)
npx tsc --noEmit

# Run ESLint (Must exit 0 with 0 errors)
npm run lint
```

### Client Verification (`client/`)
```bash
cd client

# Run Vitest component & store tests (3 test suites, 18 tests)
npm test -- --run

# Run Next.js production build with Turbopack (Must exit 0)
npm run build

# Run Next.js production build with Webpack (Must exit 0)
npx next build --webpack

# Run TypeScript typecheck (Must exit 0 with 0 errors)
npx tsc --noEmit

# Run ESLint (Must exit 0 with 0 errors)
npm run lint
```

---

## License & Intellectual Property

This software is developed and maintained as part of the **Design-to-Elementor Autonomous AI Conversion Studio**. All rights reserved. Native Elementor template schemas conform to the Elementor Template Specification v0.4.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3.1-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-darkblue.svg)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0.5-yellow.svg)](https://vitest.dev/)

**Design-to-Elementor** is an enterprise-grade automated compiler and AI conversion pipeline that translates visual UI designs, screenshots, and mockups into native, fully editable **WordPress Elementor 3.x / 4.x Flexbox Container JSON structures**. The system operates through a deterministic 4-stage pipeline (Vision Analysis, Structural DIR Synthesis, Elementor Compilation, and Fidelity Review) backed by an asynchronous PostgreSQL job queue, local/Backblaze B2 storage, and remote publishing via the official **Elementor Model Context Protocol (MCP)** interface.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Complete Execution Workflow](#2-complete-execution-workflow)
3. [UML Activity Diagrams](#3-uml-activity-diagrams)
   - [3.1 End-to-End Conversion Pipeline Flow](#31-end-to-end-conversion-pipeline-flow)
   - [3.2 Background Worker & Optimistic Lease Management](#32-background-worker--optimistic-lease-management)
   - [3.3 DIR Schema Validation, Normalization & Targeted Repair](#33-dir-schema-validation-normalization--targeted-repair)
   - [3.4 Remote WordPress MCP Publishing & Two-Phase Fallback](#34-remote-wordpress-mcp-publishing--two-phase-fallback)
4. [Module Relationships & Data Flow Matrix](#4-module-relationships--data-flow-matrix)
5. [Detailed Module & Component Reference](#5-detailed-module--component-reference)
   - [5.1 Storage Engine & Image Processing](#51-storage-engine--image-processing)
   - [5.2 AI Engine, Routing & Model Capabilities](#52-ai-engine-routing--model-capabilities)
   - [5.3 Design Intermediate Representation (DIR)](#53-design-intermediate-representation-dir)
   - [5.4 Elementor 3.x Generator & Compiler](#54-elementor-3x-generator--compiler)
   - [5.5 Model Context Protocol (MCP) WordPress Bridge](#55-model-context-protocol-mcp-wordpress-bridge)
   - [5.6 Database Schema, Concurrency & Transactions](#56-database-schema-concurrency--transactions)
   - [5.7 Frontend Client Application](#57-frontend-client-application)
6. [Error Handling, Resilience & Recovery Policies](#6-error-handling-resilience--recovery-policies)
7. [Configuration & Environment Variables](#7-configuration--environment-variables)
8. [Developer Setup & Quickstart Guide](#8-developer-setup--quickstart-guide)
9. [Systematic Debugging & Troubleshooting Guide](#9-systematic-debugging--troubleshooting-guide)
10. [Test Suites & Quality Verification](#10-test-suites--quality-verification)

---

## 1. System Architecture Overview

The codebase is organized as a decoupled TypeScript full-stack monorepo with an Express REST API backend, an asynchronous worker daemon, and a Next.js 16 React 19 frontend:

```mermaid
graph TB
    subgraph Client ["Frontend Client (client/) — Next.js 16 App Router & React 19"]
        UI_Dash["Dashboard (/)"]
        UI_Upload["Upload Intake (/upload)"]
        UI_Project["Project Inspector (/projects/:id)"]
        UI_Publish["Publish Studio (/projects/:id/publish)"]
        UI_Settings["Site Connections (/settings)"]
        API_Layer["Axios API Client (src/lib/api.ts)"]
        Auth_Store["Zustand Auth Store (src/store/auth.ts)"]
    end

    subgraph Server_API ["API Server (server/src/index.ts) — Express 4.21"]
        MW_Sec["Security Middleware (Helmet, CORS, RateLimit)"]
        MW_Auth["Auth Middleware (requireAuth, getAuthenticatedUserId)"]
        MW_Upload["Multer Upload Middleware (MemoryBuffer)"]
        Routes_Auth["Auth Routes (/api/v1/auth)"]
        Routes_Upload["Upload Routes (/api/v1/upload)"]
        Routes_Projects["Project Routes (/api/v1/projects)"]
        Routes_Jobs["Job Routes (/api/v1/jobs)"]
        Routes_Sites["Site & Publish Routes (/api/v1/sites)"]
        Storage_Static["Static Storage Handler (/storage/*)"]
    end

    subgraph Worker ["Conversion Worker Daemon (server/src/worker.ts)"]
        Worker_Loop["Polling Loop (FOR UPDATE SKIP LOCKED)"]
        Heartbeat["Lease Heartbeat (30s interval, 3m expiry)"]
        Orchestrator["Conversion Orchestrator (orchestrator.ts)"]
    end

    subgraph Pipeline ["4-Stage AI Pipeline (server/src/modules/conversion/)"]
        Stage_Vision["Stage 1: Vision Analysis (Gemini Flash)"]
        Stage_Struct["Stage 2: Structure Synthesis (Groq / GPT-OSS)"]
        Stage_Repair["DIR Repair & Asset Bounds (asset-bounds.ts)"]
        Stage_Gen["Stage 3: Elementor Compilation (generator.ts)"]
        Stage_Review["Stage 4: Fidelity Review (Claude 3.5 Sonnet)"]
        Quality_Gate["Deterministic Quality Gate"]
    end

    subgraph Core_Services ["Core Engine Services (server/src/modules/)"]
        AI_Router["AI Router & Capabilities (modules/ai/)"]
        AI_Cache["7-Factor Composite Cache (modules/ai/cache.ts)"]
        Storage_Engine["Storage Adapters: Local / B2 (modules/storage/)"]
        Image_Proc["Sharp Processor: Tiling & Cropping (image-processor.ts)"]
        Elementor_Compiler["Elementor Serializer & Validator (modules/elementor/)"]
        MCP_Bridge["MCP Client & Publisher (modules/mcp/)"]
    end

    subgraph Storage_Layer ["Data & Storage Layer"]
        Postgres[("PostgreSQL 15+ (Prisma ORM)")]
        Local_FS[("./storage/uploads/ (Local Adapter)")]
        Backblaze_B2[("Backblaze B2 S3 (Cloud Adapter)")]
    end

    subgraph External_WP ["Target WordPress Site (WordPress 6.8+ / Elementor 4.3+)"]
        WP_Core["WordPress REST API"]
        WP_Bridge["Elementor MCP Bridge Plugin (elementor-mcp-bridge.php)"]
    end

    %% Interactions
    UI_Dash & UI_Upload & UI_Project & UI_Publish & UI_Settings --> API_Layer
    API_Layer -->|HTTP Bearer JWT| Server_API
    Server_API --> MW_Sec --> MW_Auth
    MW_Upload --> Image_Proc
    Routes_Upload --> Storage_Engine
    Routes_Upload --> Postgres
    Routes_Projects & Routes_Jobs & Routes_Sites --> Postgres
    Worker_Loop -->|Poll queued jobs| Postgres
    Worker_Loop --> Orchestrator
    Orchestrator --> Stage_Vision --> Stage_Struct --> Stage_Repair --> Stage_Gen --> Stage_Review --> Quality_Gate
    Stage_Vision & Stage_Struct & Stage_Review --> AI_Router
    AI_Router --> AI_Cache
    Stage_Repair --> Image_Proc --> Storage_Engine
    Stage_Gen --> Elementor_Compiler
    Quality_Gate -->|Update job artifacts| Postgres
    Routes_Sites --> MCP_Bridge -->|JSON-RPC over HTTP| WP_Bridge --> WP_Core
    Storage_Engine --> Local_FS & Backblaze_B2
```

---

## 2. Complete Execution Workflow

The end-to-end execution of a design conversion follows five distinct architectural phases:

```
[Phase 1: Intake & Storage] ➔ [Phase 2: Queuing & Worker Lease] ➔ [Phase 3: 4-Stage Conversion Engine] ➔ [Phase 4: Quality Gate] ➔ [Phase 5: MCP Remote Publishing]
```

### Phase 1: Upload Intake & Sanitization
1. **Client Action:** The user selects or drags a design mockup (`.png`, `.jpg`, `.jpeg`) into the Dropzone at `/upload`.
2. **API Intake:** The client transmits a `multipart/form-data` POST request to `/api/v1/upload`.
3. **Authentication Check:** [`requireAuth`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/auth.ts) verifies the JWT in the `Authorization: Bearer <token>` header and [`getAuthenticatedUserId`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/auth.ts) extracts the validated `userId`.
4. **Buffer Extraction:** Multer parses the file into an in-memory `Buffer` (`uploadMiddleware.fields`).
5. **Magic Bytes Validation:** [`checkMagicBytes(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) validates file signatures (`0x89504E47` for PNG, `0xFFD8FFE0/E1` for JPEG) to prevent malicious executable uploads disguised as images.
6. **Decompression Bomb Guard:** [`validateImage(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) invokes Sharp to inspect dimensions and ensures `width * height <= 100,000,000` (100 Megapixel limit), throwing `ValidationError` if exceeded.
7. **Orientation Normalization:** [`normalizeImageOrientation(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) strips EXIF rotation metadata and bakes orientation into the raw raster buffer.
8. **Storage Accounting:** Within a Prisma transaction, [`reserveStorage(tx, userId, fileBytes)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/accounting.ts) checks whether `user.usedStorage + fileBytes > user.storageQuota`. If quota is exceeded, an `AppError('Storage quota exceeded', 413, 'STORAGE_QUOTA_EXCEEDED')` is thrown.
9. **Asset Persistence:** The adapter ([`LocalStorageAdapter`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/local.ts) or [`B2StorageAdapter`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/b2.ts)) writes the file to `projects/:projectId/originals/:uuid_:fileName`.
10. **Database Records:** An `Asset` record and a `ConversionJob` with status `'queued'`, `attempts: 0`, and `maxAttempts: 3` are atomically created.

### Phase 2: Asynchronous Job Queuing & Lease Management
1. **Background Polling:** The standalone worker daemon ([`server/src/worker.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/worker.ts)) continuously polls the PostgreSQL database.
2. **Optimistic Row Locking:** `acquireJob()` executes an atomic raw query:
   ```sql
   SELECT id FROM "ConversionJob"
   WHERE status = 'queued' AND "deletingAt" IS NULL
   ORDER BY "createdAt" ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
   ```
3. **Lease Acquisition:** The worker marks `status = 'processing'`, sets its unique `workerId`, records `lockedAt = NOW()`, sets `leaseExpiresAt = NOW() + 3 minutes`, and increments `attempts = attempts + 1`.
4. **Heartbeat Timer:** A background timer runs every 30 seconds (`HEARTBEAT_INTERVAL_MS`), updating `lastHeartbeat = NOW()` and extending `leaseExpiresAt` by 3 minutes to prevent timeout while AI stages are running.
5. **Stale Lease Reaper:** Every polling cycle, any job with `status = 'processing'` where `leaseExpiresAt < NOW()` is reclaimed. If `attempts < maxAttempts`, it resets to `'queued'`; otherwise, it transitions to `'failed'`.

### Phase 3: The 4-Stage AI Conversion Engine
[`ConversionOrchestrator.runJob(jobId)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/orchestrator.ts) coordinates the execution across four sequential stages:

#### Stage 1: Vision Layout Analysis (`vision_analysis`)
- **Tiling Engine:** If the source image is tall (height > 2400px), [`createTiles(buffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts) produces vertical strips with a 200px boundary overlap so section headers spanning seams are not missed.
- **Provider Resolution:** Resolves `VISION_AI_PROVIDER` (default `gemini`, model `gemini-3.8-flash`).
- **Capability Check:** Enforces that the model supports image inputs (`supportsVision: true`).
- **Cache Check:** Computes a 7-factor composite SHA-256 hash ([`computeStageCacheKey`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/cache.ts)). If a matching `StageCache` record exists with complete output, the LLM request is bypassed.
- **Output:** An intermediate structured JSON document detailing visual sections, grid columns, color palettes, typography hierarchies, and component bounding boxes.

#### Stage 2: Structural DIR Synthesis (`structure_synthesis`)
- **Provider Resolution:** Resolves `STRUCTURE_AI_PROVIDER` (default `groq`, model `openai/gpt-oss-120b`).
- **Capability Stripping:** Text-only models automatically have raster attachments stripped before dispatch to prevent provider API rejections.
- **Synthesis:** The AI generates a comprehensive **Design Intermediate Representation (DIR)** document conforming to the canonical schema.
- **Validation & Auto-Repair:**
  - The JSON is validated against [`dirDocumentSchema`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/schema.ts).
  - If schema validation fails, [`normalizeDIRDocument`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/normalizer.ts) performs deterministic recovery (fixing numeric conversions, defaulting semantic tags, fixing missing IDs).
  - If normalization cannot resolve errors, a targeted section-level AI repair prompt is executed.
- **Asset Bounds Reconciliation:** [`reconcileAssetBounds(dir, imageBuffer)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/asset-bounds.ts) locates image nodes with pixel-coordinate `sourceRect` definitions, uses Sharp to crop individual logos, badges, and graphics from the source image, uploads them to storage, and replaces `sourceRect` with permanent relative storage URLs.

#### Stage 3: Elementor 3.x Compilation (`elementor_generation`)
- **Deterministic Compiler:** [`ElementorGenerator.generate(dirDocument)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/generator.ts) converts DIR nodes into Elementor 3.x/4.x Flexbox containers and Core widgets.
- **Container Semantics:** Maps DIR sections into root containers (`elType: 'container'`), converting flex directions (`row`, `column`), wrap states, align items, justify content, and percentage/pixel widths.
- **Widget Translation:** Maps 20+ DIR element types to native Elementor widgets:
  - `heading` -> Elementor `heading` (`title`, `header_size`, typography styling)
  - `text` / `paragraph` -> Elementor `text-editor` (`editor` HTML content)
  - `button` -> Elementor `button` (`text`, `link`, `button_type`, colors, radius)
  - `image` -> Elementor `image` (`image.url`, dimensions)
  - `icon` / `icon_box` -> Elementor `icon-box` (`icon`, `title_text`, `description_text`)
  - `card` / `container` -> Nested Flexbox `container`
- **ID Generation:** Assigns unique 8-character hexadecimal IDs (`generateElementId()`) to every container and widget.
- **Responsive Profiles:** Computes desktop, tablet, and mobile styles using [`responsive-capabilities.json`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/responsive-capabilities.json).

#### Stage 4: Fidelity Review & Quality Gate (`fidelity_review`)
- **Reviewer:** `REVIEW_AI_PROVIDER` (default `openrouter`, model `anthropic/claude-3.5-sonnet`) evaluates the compiled structure against visual requirements.
- **Content Audit:** [`auditContentFidelity(dir, elementor)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/conversion/content-audit.ts) extracts text strings and verifies no headings or body copy were lost during compilation.
- **Deterministic Quality Gate:**
  - Verifies DIR contains at least 1 section and > 0 nodes.
  - Verifies Elementor document contains at least 1 root container and registered widgets.
  - Verifies all image widgets contain populated image URLs.
- **Completion:** Job status is updated to `'preview_ready'`, storing `dirArtifact`, `elementorArtifact`, and `previewArtifact` in the database.

### Phase 4: Frontend Live Inspection & Polling
1. The client project page (`/projects/:id`) polls `/api/v1/projects/:id/job` every 2 seconds.
2. The Stage Progress component ([`stage-progress.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/components/conversion/stage-progress.tsx)) displays real-time progress indicators, duration, and token usage for each stage.
3. Upon completion, the interactive **DIR Inspector** ([`dir-inspector.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/components/conversion/dir-inspector.tsx)) renders a browsable DOM tree of sections, nodes, and styling rules.
4. Users can download the native Elementor Template JSON file for direct import into the WordPress Elementor Editor (`Import Template` dialog).

### Phase 5: Remote WordPress Publishing via MCP
1. **Connection Setup:** The user registers a target WordPress site in `/settings`, providing the site URL, WordPress username, and an Application Password.
2. **Encrypted Storage:** The API encrypts credentials using AES-256-GCM ([`encrypt(json)`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/security/crypto.ts)) and stores them in `SiteConnection`.
3. **Publish Trigger:** The user navigates to `/projects/:id/publish`, selects the target site and post title, and clicks **Publish to WordPress**.
4. **MCP Handshake:** [`MCPClient`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/client.ts) connects to the WordPress site's MCP bridge endpoint and performs capability discovery (`tools/list`).
5. **Two-Phase Publication:**
   - *Primary:* If `elementor_create_page` tool is discovered, creates the page and attaches the Elementor container tree in one operation.
   - *Fallback:* If only core tools are discovered, calls `wp_create_post` to create a draft page ID, followed by `elementor_set_post_data` to set `_elementor_data`, `_elementor_edit_mode = 'builder'`, and `_elementor_template_type = 'wp-page'`.
6. **Read-Back Verification:** The client calls `elementor_get_post_data` or `wp_get_post` to confirm that the container tree was successfully persisted in WordPress post meta.

---

## 3. UML Activity Diagrams

### 3.1 End-to-End Conversion Pipeline Flow

The following UML Activity Diagram illustrates the complete execution path, conditional branches, error checks, and quality gates from intake to final output:

```mermaid
flowchart TD
    Start([User uploads design mockup]) --> ValidateIntake{Magic bytes & 100MP check}
    
    ValidateIntake -- Invalid signature or >100MP --> RejectUpload[Throw ValidationError 400]
    RejectUpload --> EndFailed([End: Request Rejected])
    
    ValidateIntake -- Valid --> CheckQuota{User storage quota exceeded?}
    CheckQuota -- Exceeded --> RejectQuota[Throw StorageError 413]
    RejectQuota --> EndFailed
    
    CheckQuota -- Within Quota --> SaveStorage[Persist original image in Local/B2 Storage]
    SaveStorage --> CreateJob[Create Asset & ConversionJob in DB: status = queued]
    CreateJob --> NotifyClient[Return 201 Created with jobId]
    
    NotifyClient --> WorkerPoll[Worker acquires job: FOR UPDATE SKIP LOCKED]
    WorkerPoll --> StartHeartbeat[Start 30s lease heartbeat pulse]
    
    StartHeartbeat --> CheckTile{Image height > 2400px?}
    CheckTile -- Yes --> GenerateTiles[Generate overlapping vertical tiles]
    CheckTile -- No --> SingleImage[Use full image buffer]
    
    GenerateTiles --> VisionStage[Stage 1: Vision Analysis via Gemini Flash]
    SingleImage --> VisionStage
    
    VisionStage --> CheckVisionCache{7-Factor cache hit in DB?}
    CheckVisionCache -- Hit --> LoadVisionCache[Load cached vision JSON]
    CheckVisionCache -- Miss --> CallVisionAI[Invoke Gemini API with vision prompt]
    CallVisionAI --> StoreVisionCache[Cache vision output]
    StoreVisionCache --> SynthStage[Stage 2: Structure Synthesis via Groq]
    LoadVisionCache --> SynthStage
    
    SynthStage --> ValidateDIR{DIR Schema Zod validation}
    ValidateDIR -- Fails validation --> NormalizeDIR[Execute deterministic normalizer]
    NormalizeDIR --> RecheckDIR{Schema valid now?}
    RecheckDIR -- No --> AIRepair[Execute targeted section AI repair]
    AIRepair --> ValidateDIR
    
    RecheckDIR -- Yes --> ReconcileBounds[Reconcile asset bounds & crop logos/graphics]
    ValidateDIR -- Valid --> ReconcileBounds
    
    ReconcileBounds --> CompileElementor[Stage 3: Elementor 3.x Generator]
    CompileElementor --> InjectSkill[Inject responsive capabilities & SKILL.md]
    InjectSkill --> ValidateElementor{Validate container nesting & widget registry}
    
    ValidateElementor -- Validation Error --> CompilationFailure[Throw CompilationError]
    CompilationFailure --> RetryLogic{Attempt < MaxAttempts?}
    
    ValidateElementor -- Valid --> ReviewStage[Stage 4: Fidelity Review via Claude 3.5]
    ReviewStage --> QualityGate{Deterministic Quality Gate: >0 nodes & images populated}
    
    QualityGate -- Failed --> RetryLogic
    RetryLogic -- Yes --> ResetQueued[Reset status = queued, clear lease, wait backoff]
    ResetQueued --> WorkerPoll
    RetryLogic -- No --> FailJob[Set status = failed with error details]
    FailJob --> EndFailed
    
    QualityGate -- Passed --> MarkReady[Set status = preview_ready with artifacts]
    MarkReady --> StopHeartbeat[Stop heartbeat timer]
    StopHeartbeat --> ReadyState([Job Ready for Download or Publish])
    
    ReadyState --> PublishRequest{User clicks Publish to WordPress}
    PublishRequest -- No --> EndDone([End: Template JSON Downloaded])
    
    PublishRequest -- Yes --> MCPHandshake[MCP Client initializes connection & discovers tools]
    MCPHandshake --> CheckTools{elementor_create_page tool available?}
    
    CheckTools -- Yes --> DirectPublish[Execute elementor_create_page tool]
    CheckTools -- No --> FallbackPublish[Execute wp_create_post then elementor_set_post_data]
    
    DirectPublish --> ReadbackVerify{Read back created page from WordPress}
    FallbackPublish --> ReadbackVerify
    
    ReadbackVerify -- Containers match --> MarkPublished[Set job status = published with live URL]
    ReadbackVerify -- Mismatch or Error --> ThrowMCP[Throw MCPError & rollback]
    
    MarkPublished --> EndSuccess([End: Published Successfully])
    ThrowMCP --> EndFailed
```

---

### 3.2 Background Worker & Optimistic Lease Management

The worker daemon executes concurrency-limited processing using PostgreSQL atomic row locks:

```mermaid
flowchart TD
    subgraph WorkerDaemon ["Worker Polling Daemon (server/src/worker.ts)"]
        W_Start([Worker Process Started]) --> W_Reap[Check for expired worker leases: leaseExpiresAt <= NOW]
        W_Reap --> W_Reclaim{Expired jobs found?}
        W_Reclaim -- Yes --> W_CheckAttempts{attempts < maxAttempts?}
        W_CheckAttempts -- Yes --> W_ResetQueued[Reset to status = queued, workerId = null]
        W_CheckAttempts -- No --> W_MarkFailed[Set status = failed: Worker lease expired]
        W_Reclaim -- No --> W_Slots{Active slots < CONVERSION_WORKER_CONCURRENCY?}
        W_ResetQueued --> W_Slots
        W_MarkFailed --> W_Slots
        
        W_Slots -- No --> W_Sleep[Sleep POLL_INTERVAL_MS = 2000ms]
        W_Sleep --> W_Reap
        
        W_Slots -- Yes --> W_Query[Execute: SELECT FOR UPDATE SKIP LOCKED]
        W_Query --> W_Found{Job row returned?}
        W_Found -- No --> W_Sleep
        
        W_Found -- Yes --> W_Acquire[Set status = processing, lockedAt = NOW, leaseExpiresAt = NOW + 3m]
        W_Acquire --> W_Spawn[Spawn runJob in background slot]
        W_Spawn --> W_Heartbeat[Start 30s Heartbeat Timer]
        
        W_Heartbeat --> W_Pulse[Pulse: UPDATE leaseExpiresAt = NOW + 3m, lastHeartbeat = NOW]
        W_Pulse --> W_JobFinished{Job completed or thrown?}
        W_JobFinished -- No --> W_WaitPulse[Wait 30s] --> W_Pulse
        
        W_JobFinished -- Yes --> W_ClearTimer[Clear Heartbeat Timer]
        W_ClearTimer --> W_SlotFree[Decrement active slot count]
        W_SlotFree --> W_Reap
    end
```

---

### 3.3 DIR Schema Validation, Normalization & Targeted Repair

The DIR subsystem guarantees that invalid AI output never crashes the Elementor compiler:

```mermaid
flowchart TD
    subgraph DIR_Processing ["DIR Pipeline (modules/dir/)"]
        RawAI[Raw AI Output JSON String] --> JSONParse{Valid JSON Syntax?}
        
        JSONParse -- No --> ExtractJSON[Regex extract largest bracketed JSON block]
        ExtractJSON --> JSONParse2{Valid JSON now?}
        JSONParse2 -- No --> ParseFail[Throw ValidationError: Malformed JSON output]
        
        JSONParse -- Yes --> ZodCheck{dirDocumentSchema.safeParse}
        JSONParse2 -- Yes --> ZodCheck
        
        ZodCheck -- Success --> ReturnValid[Return validated DIRDocument]
        
        ZodCheck -- Failure --> Normalizer[Invoke normalizeDIRDocument]
        Normalizer --> Norm_Sections[Ensure sections array exists & has valid roles]
        Norm_Sections --> Norm_Nodes[Recursively assign UUIDs, default styles, coerce numbers]
        Norm_Nodes --> Norm_CSS[Normalize CSS units, flexbox props, color hexes]
        Norm_CSS --> Revalidate{Schema valid after normalization?}
        
        Revalidate -- Yes --> ReturnValid
        
        Revalidate -- No --> SectionRepair[Section-Level AI Repair Loop]
        SectionRepair --> IdentifyBad[Isolate specific invalid sections and Zod issues]
        IdentifyBad --> PromptRepair[Prompt AI with targeted section repair prompt]
        PromptRepair --> RepairParse{Repaired section validates?}
        RepairParse -- Yes --> SpliceSection[Splice repaired section back into DIR document]
        SpliceSection --> FinalCheck{Full document validates?}
        FinalCheck -- Yes --> ReturnValid
        FinalCheck -- No --> FailRepair[Throw ValidationError: DIR repair exhausted]
        RepairParse -- No --> FailRepair
    end
```

---

### 3.4 Remote WordPress MCP Publishing & Two-Phase Fallback

The MCP publishing bridge communicates with remote WordPress instances over Model Context Protocol:

```mermaid
flowchart TD
    subgraph MCP_Publishing ["WordPress MCP Publishing Bridge (modules/mcp/)"]
        Req[POST /api/v1/publish with jobId & siteConnectionId] --> LoadSite[Load SiteConnection from DB]
        LoadSite --> DecryptCreds[AES-256-GCM decrypt application password]
        DecryptCreds --> InitClient[Initialize MCPClient with siteUrl & credentials]
        
        InitClient --> TestConn{client.testConnection: Endpoint reachable?}
        TestConn -- No --> ConnErr[Throw MCPError: WordPress site unreachable]
        
        TestConn -- Yes --> DiscTools[Discover tools via tools/list]
        DiscTools --> HasCreatePage{elementor_create_page tool present?}
        
        HasCreatePage -- Yes --> Direct[Call tool: elementor_create_page]
        Direct --> CheckDirectRes{result.isError == true?}
        CheckDirectRes -- No --> ExtractPageID[Extract created WordPress post ID]
        CheckDirectRes -- Yes --> CheckCanFallback{wp_create_post tool available?}
        
        HasCreatePage -- No --> FallbackPhase1[Call tool: wp_create_post title, status=draft]
        CheckCanFallback -- Yes --> FallbackPhase1
        CheckCanFallback -- No --> DirectFailed[Throw MCPError with WordPress message]
        
        FallbackPhase1 --> CheckDraftRes{Draft page created?}
        CheckDraftRes -- No --> DraftFailed[Throw MCPError: Failed to create draft post]
        
        CheckDraftRes -- Yes --> FallbackPhase2[Call tool: elementor_set_post_data with container tree]
        FallbackPhase2 --> CheckDataSet{elementor_set_post_data succeeded?}
        CheckDataSet -- No --> RollbackPost[Call wp_delete_post to clean up draft]
        RollbackPost --> SetFailed[Throw MCPError: Failed to attach Elementor data]
        
        CheckDataSet -- Yes --> ExtractPageID
        
        ExtractPageID --> Readback[Verify page: call elementor_get_post_data or wp_get_post]
        Readback --> VerifyContainers{Returned containers match expected count?}
        VerifyContainers -- No --> WarnMismatch[Log warning: container count mismatch]
        VerifyContainers -- Yes --> SuccessPublish[Update job status = published, store page URL]
        WarnMismatch --> SuccessPublish
        SuccessPublish --> Done([Return 200 OK with live page URL])
    end
```

---

## 4. Module Relationships & Data Flow Matrix

The table below outlines how data moves across system boundaries, specifying producers, consumers, and data types:

| Producer Module | Consumer Module | Data Transferred | Schema / Interface | Transport Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **`client/src/app/upload`** | `server/src/routes/upload.ts` | Multipart form data (Image buffer, name) | `multipart/form-data` | HTTP POST (Axios) |
| **`routes/upload.ts`** | `modules/storage/image-processor.ts` | Raw image buffer | `Buffer` | In-memory function call |
| **`modules/storage/image-processor.ts`** | `modules/storage/local.ts` / `b2.ts` | Validated buffer & MIME type | `Buffer`, `string` | Method call (`upload`) |
| **`routes/upload.ts`** | PostgreSQL (`prisma.conversionJob`) | Queued job record | `ConversionJob` | Prisma ORM Transaction |
| **PostgreSQL** | `server/src/worker.ts` | Locked job record for processing | `ConversionJob` | Atomic SQL `FOR UPDATE SKIP LOCKED` |
| **`worker.ts`** | `modules/conversion/orchestrator.ts` | Job ID & concurrency slot | `string`, `WorkerSlot` | Asynchronous invocation |
| **`orchestrator.ts`** | `modules/ai/router.ts` | Prompt text, image parts, stage role | `AIRequestOptions` | Method call (`executeRequest`) |
| **`modules/ai/router.ts`** | Gemini / Groq / OpenRouter APIs | Role-tailored system/user prompts | HTTP JSON / Multi-part | External HTTPS REST |
| **AI Provider** | `modules/dir/normalizer.ts` | Raw synthesized DIR JSON string | `string` | Return value |
| **`normalizer.ts`** | `modules/conversion/asset-bounds.ts` | Validated DIR Document | `DIRDocument` | In-memory object |
| **`asset-bounds.ts`** | `modules/storage/` | Cropped sub-asset buffers (logos, icons) | `Buffer`, `string` | Method call (`upload`) |
| **`modules/conversion/asset-bounds.ts`** | `modules/elementor/generator.ts` | Reconciled DIR Document with asset URLs | `DIRDocument` | In-memory object |
| **`modules/elementor/generator.ts`** | `modules/elementor/validator.ts` | Elementor 3.x container tree | `ElementorDocument` | In-memory object |
| **`orchestrator.ts`** | PostgreSQL (`prisma.conversionJob`) | Final artifacts (`dir`, `elementor`, `preview`) | `JsonValue` | Prisma update (`status = 'preview_ready'`) |
| **`server/src/routes/sites.ts`** | `modules/mcp/publisher.ts` | Site connection & Elementor document | `SiteConnection`, `ElementorDocument` | Method call (`publish`) |
| **`modules/mcp/publisher.ts`** | Target WordPress Site | JSON-RPC tool invocations | MCP Protocol JSON-RPC | External HTTPS POST / SSE |

---

## 5. Detailed Module & Component Reference

### 5.1 Storage Engine & Image Processing
- **Location:** [`server/src/modules/storage/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/)
- **Core Files:**
  - [`local.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/local.ts): Local filesystem implementation. Uses `getSafePath(key)` to prevent path traversal attacks by normalizing leading slashes and asserting paths remain strictly within `LOCAL_STORAGE_PATH`.
  - [`b2.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/b2.ts): S3-compatible Backblaze B2 cloud storage adapter utilizing `@aws-sdk/client-s3`.
  - [`factory.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/factory.ts): Singleton factory returning either `LocalStorageAdapter` or `B2StorageAdapter` based on `STORAGE_PROVIDER`.
  - [`image-processor.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/image-processor.ts): Sharp-based raster image processing.
    - `checkMagicBytes(buffer)`: Validates PNG/JPEG/WEBP file signatures.
    - `validateImage(buffer)`: Enforces `MAX_PIXELS_LIMIT = 100_000_000` (100MP decompression bomb guard).
    - `normalizeImageOrientation(buffer)`: Auto-rotates image according to EXIF and strips metadata.
    - `createTiles(buffer)`: Generates vertical overlapping slices for tall landing pages.
    - `cropSubAsset(buffer, rect)`: Extracts pixel-bounded regions for discrete graphics.
  - [`accounting.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/storage/accounting.ts): Manages user storage quotas with PostgreSQL row-level locks (`SELECT ... FOR UPDATE`).

### 5.2 AI Engine, Routing & Model Capabilities
- **Location:** [`server/src/modules/ai/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/)
- **Core Files:**
  - [`router.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/router.ts): Dynamic provider router. Supports `gemini`, `groq`, `openrouter`, and `mock`. Manages provider cooldowns (e.g. on HTTP 429) and routes stage roles (`vision`, `structure`, `review`) to their designated providers.
  - [`capabilities.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/capabilities.ts): Model capability guard. Maintains a registry of known vision-capable models (e.g. `gemini-3.8-flash`, `claude-3.5-sonnet`) versus text-only models (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`). Automatically strips raster parts when dispatching to text-only models.
  - [`cache.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/cache.ts): 7-factor composite SHA-256 caching engine (`StageCache` table in PostgreSQL). Skips caching if output was truncated (`finishReason: 'length'`).
  - [`providers/gemini.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/gemini.ts): Native Google Gemini adapter supporting inline image parts, exponential backoff on HTTP 503, and `Retry-After` header adherence.
  - [`providers/groq.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/groq.ts): High-throughput OpenAI-compatible Groq adapter.
  - [`providers/openrouter.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/providers/openrouter.ts): Multi-model gateway adapter supporting Anthropic, Meta, and Mistral models.

### 5.3 Design Intermediate Representation (DIR)
- **Location:** [`server/src/modules/dir/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/)
- **Core Files:**
  - [`schema.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/schema.ts): Authoritative Zod schema definition for `DIRDocument`, `DIRMeta`, `DIRGlobals`, `DIRSection`, and 26 distinct `DIRNode` variants (`heading`, `paragraph`, `button`, `image`, `container`, etc.).
  - [`normalizer.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/normalizer.ts): Deterministic AST normalizer. Resolves invalid numeric values, assigns fallback UUIDs, coerces CSS units (`px`, `%`, `rem`), maps color strings to standard hex format, and ensures container hierarchies are well-formed.
  - [`types.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/dir/types.ts): TypeScript type definitions inferred directly from the Zod schema.

### 5.4 Elementor 3.x Generator & Compiler
- **Location:** [`server/src/modules/elementor/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/)
- **Core Files:**
  - [`generator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/generator.ts): The primary compilation engine. Recursively traverses the DIR tree and outputs native Elementor Flexbox Containers (`elType: 'container'`) and Core widgets (`elType: 'widget'`). Assigns 8-character hex IDs, maps typography styles to Elementor typography controls, and configures flex wrap/direction.
  - [`serializer.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/serializer.ts): Serializes the compiled structure into the official Elementor Template JSON schema (`v0.4`). Injects operative rules from [`server/src/skills/elementor/SKILL.md`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/SKILL.md).
  - [`validator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/validator.ts): Structural validator ensuring element ID uniqueness, valid container nesting depth, and registered widget type conformance.
  - [`consistency-validator.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/elementor/consistency-validator.ts): Cross-validates generated Elementor controls against the responsive profile rules defined in [`responsive-capabilities.json`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/skills/elementor/responsive-capabilities.json).

### 5.5 Model Context Protocol (MCP) WordPress Bridge
- **Location:** [`server/src/modules/mcp/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/)
- **Core Files:**
  - [`client.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/client.ts): Low-level MCP JSON-RPC transport client. Handles endpoint handshaking, tool listing (`tools/list`), tool invocation (`tools/call`), error parsing (`result.isError`), and timeout management.
  - [`publisher.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/mcp/publisher.ts): High-level publishing orchestrator. Implements two-phase publication (direct `elementor_create_page` or fallback `wp_create_post` + `elementor_set_post_data`), followed by read-back validation.
  - [`wordpress-plugin/elementor-mcp-bridge.php`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/wordpress-plugin/elementor-mcp-bridge.php): Companion WordPress plugin that exposes the Elementor MCP tools over JSON-RPC, authenticating requests via WordPress Application Passwords.

### 5.6 Database Schema, Concurrency & Transactions
- **Location:** [`server/prisma/schema.prisma`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/prisma/schema.prisma)
- **Entities:**
  - `User`: Accounts, hashed credentials, storage usage, and quota limits (`storageQuota`).
  - `Project`: Project namespaces, descriptions, soft-deletion timestamp (`deletingAt`).
  - `Asset`: Physical files stored in Local/B2, SHA-256 hashes, pixel dimensions, MIME types.
  - `ConversionJob`: State machine (`queued` -> `processing` -> `preview_ready` -> `publishing` -> `published` / `failed` / `cancelled`), lease expiration (`leaseExpiresAt`), heartbeat timestamp (`lastHeartbeat`), retry counter (`attempts`), and JSON artifacts (`dirArtifact`, `elementorArtifact`).
  - `JobStage`: Granular telemetry per stage (stage name, attempt number, status, duration in ms, token usage, error messages).
  - `StageCache`: 7-factor composite hash cache entries preventing redundant LLM calls.
  - `SiteConnection`: WordPress connection records, encrypted application passwords (`encryptedCredentials`), discovered MCP capabilities.
- **Safety Guards:**
  - Deletion Guard: Projects undergoing deletion acquire row locks (`SELECT ... FOR UPDATE`), check that no job is currently `publishing`, set `deletingAt`, cancel queued jobs, remove physical files, synchronize quota, and purge database rows atomically.

### 5.7 Frontend Client Application
- **Location:** [`client/`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/)
- **Framework & Libraries:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React, Framer Motion, TanStack Query, Zustand.
- **Core Pages & Components:**
  - [`src/app/layout.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/layout.tsx): Root layout with font imports, theme init script, and `suppressHydrationWarning` on `<body>` to neutralize browser extension DOM mutations.
  - [`src/app/globals.css`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/globals.css): Tailwind CSS v4 theme entry point with unnested `:root` and `.dark` variables for universal Webpack and Turbopack compatibility.
  - [`src/app/upload/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/upload/page.tsx): Drag-and-drop file upload with instant blob inspection preview.
  - [`src/app/projects/[id]/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/projects/[id]/page.tsx): Main conversion workspace featuring real-time stage progress polling, DIR tree visualizer, Elementor raw JSON viewer, and template download.
  - [`src/app/projects/[id]/publish/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/projects/[id]/publish/page.tsx): WordPress publishing interface with target site selector and status streaming.
  - [`src/app/settings/page.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/settings/page.tsx): WordPress MCP connection manager with instant connection testing.

---

## 6. Error Handling, Resilience & Recovery Policies

The system enforces a standardized error hierarchy defined in [`server/src/lib/errors.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/lib/errors.ts):

| Error Class | HTTP Status | Error Code | Description / Recovery Policy |
| :--- | :--- | :--- | :--- |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Schema validation failure (Zod payload mismatch, bad parameters). Returns field-level error details. |
| `AuthError` | 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | Missing/expired JWT, invalid credentials, or role mismatch. Directs user to re-authenticate. |
| `NotFoundError` | 404 | `NOT_FOUND` | Project, Job, Asset, or Site connection does not exist or belongs to another user. |
| `StorageError` | 400 / 500 / 413 | `STORAGE_ERROR` / `STORAGE_QUOTA_EXCEEDED` | File resolution failure, path traversal attempt blocked, or user storage quota exceeded. |
| `AIProviderError` | 502 / 503 / 504 / 429 | `AI_PROVIDER_ERROR` | LLM API error. Flags `isRetryable = true` for transient 503/429/timeouts with exponential backoff. |
| `CompilationError` | 422 | `COMPILATION_ERROR` | DIR-to-Elementor translation failure. Triggers automated section-level repair loop. |
| `MCPError` | 502 | `MCP_ERROR` | WordPress JSON-RPC bridge error. Attempts two-phase fallback before failing. |
| `AppError` | 409 | `JOB_BUSY` / `PROJECT_CHANGED` | Concurrency violation (e.g. attempting to delete project while publishing is active). |

### Transient Failure & Backoff Algorithm
For AI provider errors (e.g. Gemini 503 Service Unavailable or 429 Rate Limit):
1. The provider checks `err.status` or `err.code`.
2. If `Retry-After` header is present, it sleeps for the specified duration.
3. Otherwise, it calculates jittered exponential backoff:
   $$\text{backoffMs} = \min(\text{initialDelayMs} \times 2^{\text{attempt}}, \text{maxDelayMs}) + \text{randomJitter}$$
4. If retries are exhausted on the primary provider, `AIRouter` temporarily puts the provider in a cooldown state and routes to a fallback provider if configured.

---

## 7. Configuration & Environment Variables

### Server Configuration (`server/.env`)

```ini
# Application Environment
NODE_ENV=development                    # development | production | test
API_PORT=4000                           # Port for Express API server
TRUST_PROXY_HOPS=0                      # Number of upstream reverse proxy hops (e.g. Nginx)
WEB_ORIGIN=http://localhost:3000        # Allowed CORS origin for client requests

# Database & Security
DATABASE_URL=postgresql://postgres:password@localhost:5432/design_to_elementor
JWT_SECRET=super-secret-development-jwt-token-key-32-chars-long  # Min 32 characters in production
SITE_CREDENTIAL_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 64-char hex key

# Storage Configuration
STORAGE_PROVIDER=local                  # local | b2
LOCAL_STORAGE_PATH=./storage/uploads    # Directory for local asset uploads
UPLOAD_MAX_BYTES=524288000              # Maximum upload size (500 MB)
UPLOAD_QUOTA_BYTES=2147483648           # Default per-user storage quota (2 GB)

# Backblaze B2 (Required only if STORAGE_PROVIDER=b2)
B2_BUCKET_NAME=design-to-elementor
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_APPLICATION_KEY_ID=your-b2-key-id
B2_APPLICATION_KEY=your-b2-app-key

# Primary AI Configuration
AI_PROVIDER=groq                        # Primary default provider: groq | gemini | openrouter | mock
AI_API_KEY=your-groq-api-key            # Primary API key
AI_MODEL=openai/gpt-oss-120b            # Default model name
AI_REQUEST_TIMEOUT_MS=60000             # HTTP request timeout for LLM calls (60s)

# Dedicated AI Providers
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash
ENABLE_GEMINI=true

OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Stage-Specific Role Routing
VISION_AI_PROVIDER=gemini               # Provider for Stage 1 (must support vision)
VISION_AI_MODEL=gemini-3.8-flash
STRUCTURE_AI_PROVIDER=groq              # Provider for Stage 2 (DIR synthesis)
STRUCTURE_AI_MODEL=openai/gpt-oss-120b
REVIEW_AI_PROVIDER=openrouter           # Provider for Stage 4 (Fidelity review)
REVIEW_AI_MODEL=anthropic/claude-3.5-sonnet

# Pollinations AI (Image generation fallback)
POLLINATIONS_ENDPOINT=https://image.pollinations.ai/prompt
POLLINATIONS_MODEL=flux
ENABLE_POLLINATIONS=true
POLLINATIONS_TIMEOUT_MS=30000
POLLINATIONS_MAX_RETRIES=2

# Conversion Worker Daemon
CONVERSION_WORKER_CONCURRENCY=2         # Maximum concurrent conversion jobs
CONVERSION_MAX_ATTEMPTS=3               # Maximum retry attempts before marking job failed
RUN_LIVE_AI_TESTS=false                 # Set true only when running live LLM integration tests
```

### Client Configuration (`client/.env.local`)

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

---

## 8. Developer Setup & Quickstart Guide

### Prerequisites
- **Node.js:** `>= 22.12.0`
- **npm:** `>= 10.0.0`
- **PostgreSQL:** `>= 15.0` running locally or accessible via network
- **Native Build Tools:** Python and C++ build tools (required for Sharp native bindings)

### Installation & Initialization

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Elementor_Conversion
   ```

2. **Setup Server:**
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edit .env and configure your DATABASE_URL and AI API keys
   npx prisma db push
   ```

3. **Setup Client:**
   ```bash
   cd ../client
   npm install
   ```

### Running the Development Environment

To run the complete system, launch the API server, the background worker daemon, and the Next.js frontend in separate terminal windows:

- **Terminal 1 — API Server:**
  ```bash
  cd server
  npm run dev
  # Server starts on http://localhost:4000
  ```

- **Terminal 2 — Background Conversion Worker:**
  ```bash
  cd server
  npm run worker
  # Worker daemon starts polling for queued jobs
  ```

- **Terminal 3 — Frontend Web Application:**
  ```bash
  cd client
  npm run dev
  # Next.js starts on http://localhost:3000
  ```

---

## 9. Systematic Debugging & Troubleshooting Guide

### 1. Request Tracing with `X-Request-Id`
Every incoming HTTP request is assigned a unique UUID by [`requestIdMiddleware`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/middleware/requestId.ts).
- This ID is returned in the `X-Request-Id` response header.
- All Pino log entries generated during that request include `reqId: "..."`.
- **Action:** When a client reports an error, locate the `X-Request-Id` from their network tab and search the server logs:
  ```bash
  grep "reqId.*<uuid>" server.log
  ```

### 2. Inspecting Intermediate Conversion Artifacts
If a conversion job produces unexpected Elementor layouts:
1. Open the job in the database:
   ```sql
   SELECT id, status, "errorMessage", "dirArtifact", "elementorArtifact"
   FROM "ConversionJob" WHERE id = 'your-job-id';
   ```
2. Inspect the `dirArtifact` JSON:
   - Check `sections`: Are all page sections identified?
   - Check `nodes`: Are text, headings, and images properly classified?
   - Check `sourceRect`: Are pixel coordinates within the image bounds?
3. Inspect `JobStage` records to see stage-by-stage telemetry:
   ```sql
   SELECT stage, status, "durationMs", "tokensUsed", "errorMessage"
   FROM "JobStage" WHERE "jobId" = 'your-job-id' ORDER BY "attempt" ASC, "createdAt" ASC;
   ```

### 3. Diagnosing AI Model Rejections
- **Symptom:** AI request fails with `400 Bad Request` or `Model does not support vision`.
- **Cause:** A text-only model (e.g. `openai/gpt-oss-120b`) was assigned to a vision stage, or image parts were not stripped.
- **Verification:** Check [`capabilities.ts`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/server/src/modules/ai/capabilities.ts). Ensure `VISION_AI_PROVIDER` is set to `gemini` or a model registered with `supportsVision: true`.

### 4. Diagnosing WordPress MCP Connection Failures
- **Symptom:** Clicking "Test Connection" in `/settings` fails with `MCPError: WordPress site unreachable` or `401 Unauthorized`.
- **Checklist:**
  1. Verify the companion plugin `elementor-mcp-bridge.php` is active in `wp-admin/plugins.php`.
  2. Verify the site URL begins with `https://` (or `http://` for local testbeds).
  3. Verify Application Passwords are enabled in WordPress (`Users` -> `Profile` -> `Application Passwords`).
  4. Test raw connectivity via curl:
     ```bash
     curl -i -u "username:app_password" https://example.com/wp-json/mcp-bridge/v1/health
     ```

### 5. Resolving Client Hydration Warnings
- **Symptom:** React hydration mismatch logged in the browser console mentioning `cz-shortcut-listen` or `data-new-gr-c-s-check-loaded`.
- **Cause:** Browser extensions (ColorZilla, Grammarly) inject attributes into `<body>` before React hydrates.
- **Solution:** Verify `suppressHydrationWarning` is present on both `<html lang="en" suppressHydrationWarning>` and `<body suppressHydrationWarning ...>` in [`client/src/app/layout.tsx`](file:///e:/BrainGIG%20Internship/Mubasshir/Elementor_Conversion/client/src/app/layout.tsx).

---

## 10. Test Suites & Quality Verification

The repository maintains automated test suites covering unit logic, integration flows, and compiler fidelity:

### Server Verification (`server/`)
```bash
cd server

# Run full automated test suite (30 test suites, 290 tests)
npm test -- --run

# Run TypeScript typecheck (Must exit 0 with 0 errors)
npx tsc --noEmit

# Run ESLint (Must exit 0 with 0 errors)
npm run lint
```

### Client Verification (`client/`)
```bash
cd client

# Run Vitest component & store tests (3 test suites, 18 tests)
npm test -- --run

# Run Next.js production build with Turbopack (Must exit 0)
npm run build

# Run Next.js production build with Webpack (Must exit 0)
npx next build --webpack

# Run TypeScript typecheck (Must exit 0 with 0 errors)
npx tsc --noEmit

# Run ESLint (Must exit 0 with 0 errors)
npm run lint
```

---

## License & Intellectual Property

This software is developed and maintained as part of the **Design-to-Elementor Autonomous AI Conversion Studio**. All rights reserved. Native Elementor template schemas conform to the Elementor Template Specification v0.4.

