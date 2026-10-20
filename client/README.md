# Design2Elementor (IMG_PROJECT) — Comprehensive System Documentation & Technical Audit

> **Repository:** `e:\BrainGIG Internship\Mubasshir\IMG_PROJECT`  
> **Documentation Date:** October 15, 2026  
> **Audience:** Academic Instructors, Senior Engineers, and Autonomous AI Pair-Programmers  
> **Audit Status:** Grounded in verified source code, Prisma migrations, unit/integration test suites, and build outputs.  

---

## 4.1 Project Overview

### Purpose & Problem Statement
Web designers and frontend developers routinely design high-fidelity mockups or landing pages in visual design tools. Recreating these designs inside WordPress Elementor is traditionally a manual, repetitive, multi-hour process: slicing images, reconstructing nested container hierarchies, matching typography and color hex codes, and configuring responsive breakpoints. Generic HTML-to-WordPress converters frequently output brittle, uneditable inline HTML blocks or raw shortcodes rather than native Elementor widgets and modern Flexbox/Grid containers.

**Design2Elementor** is an automated design-to-Elementor conversion system. It accepts webpage screenshots or visual mockups and translates them into native, fully editable Elementor JSON structures (Template Schema v0.4 / Flexbox Containers) that can be imported directly into the Elementor Editor or published remotely to WordPress via the official **Elementor Model Context Protocol (MCP)** interface.

### Supported Input Types
- **Verified Implemented:**
  - Raster screenshots and UI mockups in `PNG` and `JPEG` formats.
  - Full-page landing page captures (processed via sharp-based vertical tiling with boundary overlap).
- **Not Implemented / Placeholder Only:**
  - *Figma API / Tokens / Fig files:* Not implemented in backend conversion pipeline.
  - *React / Next.js Source Code Conversion:* Not implemented.
  - *Framer Export:* Not implemented.

### Generated Output & Intended Usage
1. **Design Intermediate Representation (DIR) JSON:** An authoritative, schema-validated JSON document (`v1.0.0`) describing page hierarchy, semantic section roles, typography, color palettes, bounding boxes, and responsive overrides.
2. **Native Elementor Template JSON (`v0.4`):** An exportable JSON file composed of native Elementor Flexbox/Grid containers and registered Core widgets (`heading`, `text-editor`, `button`, `image`, `icon-box`, `icon-list`, `google_maps`, `divider`, `spacer`, `video`, `tabs`, `accordion`, `counter`, `progress`).
3. **Cropped Image Assets:** Discrete visual sub-assets (logos, hero graphics) automatically cropped from the source screenshot using pixel-coordinate bounding boxes and stored in asset storage.
4. **Remote WordPress Publishing:** Direct publication of the generated page or template to a connected WordPress 6.8+ / Elementor 4.3+ site via JSON-RPC over MCP.

---

## 4.2 Current Implementation Status

The table below reflects the verified state of the codebase following an exhaustive repository audit:

| Component / Feature | Status | Verified Implementation | Evidence (Source Files) | Remaining Work |
| :--- | :--- | :--- | :--- | :--- |
| **User Authentication** | Implemented & verified | JWT authentication, bcrypt password hashing, `/auth/register`, `/auth/login`, `/auth/dev-login`, `/auth/me` | `server/src/routes/auth.ts`<br>`server/src/middleware/auth.ts` | Email verification, password reset flows, refresh token rotation |
| **Project Management** | Implemented & verified | Project creation, listing, detail view, deletion with cascade | `server/src/routes/projects.ts` | Multi-user project collaboration, tags, project search |
| **Upload Intake & Security** | Implemented & verified | Multipart stream intake, MIME type check, magic bytes check, 100MP decompression bomb guard, SHA-256 hashing | `server/src/modules/storage/image-processor.ts`<br>`server/src/routes/upload.ts` | Client-side pre-flight image compression, WebP input format support |
| **Asset Storage (Local)** | Implemented & verified | Local filesystem storage adapter with path resolution, upload, download, exists, delete | `server/src/modules/storage/local.ts` | Automated temp file cleanup cron |
| **Asset Storage (Backblaze B2)** | Implemented but requires live credentials | S3-compatible Backblaze B2 client with upload, download, presigned URLs | `server/src/modules/storage/b2.ts` | Live production bucket connectivity verification |
| **AI Provider Routing** | Implemented & verified | Multi-provider router (Groq, Gemini, OpenRouter, Mock) with role resolution, rate-limit cooldown (429), and non-mock test isolation | `server/src/modules/ai/router.ts`<br>`server/src/modules/ai/capabilities.ts` | Dynamic token cost estimation |
| **Model Capability Guard** | Implemented & verified | Text-only model guard; rejects dispatching image parts to `openai/gpt-oss-120b` or `llama-3.3-70b-versatile`; routes vision tasks to Gemini | `server/src/modules/ai/capabilities.ts` | Runtime dynamic discovery of provider model lists |
| **AI Response Caching** | Implemented & verified | 7-factor composite hash caching in PostgreSQL (`StageCache`); skips caching on output truncation (`finishReason: 'length'`) | `server/src/modules/ai/cache.ts`<br>`server/src/modules/conversion/orchestrator.ts` | Redis cache tier for multi-instance horizontal scaling |
| **Canonical DIR Schema** | Implemented & verified | Strict Zod schema for `DIRDocument`, `DIRMeta`, `DIRGlobals`, `DIRSection`, and 26 distinct `DIRNode` variants | `server/src/modules/dir/schema.ts`<br>`server/src/modules/dir/types.ts` | Schema migration tooling for v2.0 |
| **DIR Normalization & Repair** | Implemented & verified | Deterministic normalizer resolves section/page structure, numeric coercions, CSS property mappings, and section-level targeted AI repair | `server/src/modules/dir/normalizer.ts`<br>`server/src/modules/conversion/prompts.ts` | Multi-turn conversational DIR editing |
| **Sub-Asset Cropping** | Implemented & verified | Sharp pixel cropping of logos and hero graphics from source buffer based on DIR `sourceRect` | `server/src/modules/conversion/orchestrator.ts`<br>`server/src/modules/storage/image-processor.ts` | Background removal (alpha masking) on cropped foreground elements |
| **DIR to Elementor Compiler** | Implemented & verified | Maps DIR hierarchy to native Elementor containers (flex/grid) and 20+ Core widgets with 8-character hex IDs | `server/src/modules/elementor/generator.ts` | Elementor Pro nested mega-menu widget mapping |
| **Operative Skill Injection** | Implemented & verified | Authoritative `server/ELEMENTOR_SKILL.md` (27KB) loaded dynamically and injected into AI compiler prompts; throws if missing | `server/src/modules/elementor/serializer.ts`<br>`server/ELEMENTOR_SKILL.md` | Skill version negotiation based on target WordPress site |
| **Elementor Validation** | Implemented & verified | Validates element ID uniqueness, valid `elType`, widget registration, and container nesting depth | `server/src/modules/elementor/validator.ts` | Elementor control schema validation against live WordPress core |
| **Deterministic Quality Gate** | Implemented & verified | Fails jobs if DIR contains 0 nodes, template has 0 containers/widgets, or image widgets have empty URLs | `server/src/modules/conversion/orchestrator.ts` | Visual regression score comparison against source image |
| **PostgreSQL Worker Queue** | Implemented & verified | Concurrency-limited background worker with `FOR UPDATE SKIP LOCKED`, 30s heartbeat pulse, 3-minute lease expiry, and bounded retry (3 attempts) | `server/src/worker.ts` | BullMQ / Redis adapter for distributed workers |
| **Frontend UI (Next.js 14)** | Implemented & verified | Next.js 14 App Router, Tailwind CSS, project dashboard, upload dropzone, polling stage progress, DIR tree inspector, Elementor raw inspector | `client/src/app/`<br>`client/src/components/` | Live side-by-side interactive visual canvas preview |
| **MCP WordPress Publishing** | Implemented (Mock MCP Verified) | Official Elementor MCP handshake, tool discovery, fallback post creation (`wp_create_post` + `elementor_set_post_data`), error check (`result.isError`), read-back verification | `server/src/modules/mcp/client.ts`<br>`server/src/modules/mcp/publisher.ts` | Live WordPress staging verification (requires external live site) |
| **UI-to-Backend MCP Wiring** | Partially implemented / Mismatch | Client settings form nests credentials in `{ credentials: {} }` while backend expects flat schema; `/publish` route URL mismatch | `client/src/app/settings/page.tsx`<br>`client/src/lib/api.ts`<br>`server/src/routes/sites.ts` | Align client request payload with backend Zod schema |

---

## 4.3 System Architecture

The project is structured as a TypeScript monorepo with clean separation between presentation, API, orchestration, AI abstraction, compilation, and storage.

```mermaid
graph TD
    subgraph Client ["Frontend (Next.js 14 App Router)"]
        UI_Upload["Upload Page (/upload)"]
        UI_Project["Project Detail (/projects/:id)"]
        UI_Inspector["DIR & Elementor Inspectors"]
        UI_Settings["Settings & MCP Connections (/settings)"]
        API_Client["Axios API Client (client/src/lib/api.ts)"]
    end

    subgraph Server ["Backend API (Express + TypeScript)"]
        Routes_Auth["Auth Routes (/api/v1/auth)"]
        Routes_Upload["Upload Routes (/api/v1/upload)"]
        Routes_Jobs["Job Routes (/api/v1/jobs)"]
        Routes_Sites["Site & Publish Routes (/api/v1/sites)"]
        MW_Auth["JWT & Quota Middleware"]
        MW_Upload["Multer Memory Storage"]
    end

    subgraph Storage ["Storage Layer"]
        ImgProc["Sharp Image Processor (Magic bytes, 100MP guard, tiling, cropping)"]
        LocalStorage["Local Filesystem Storage (./storage/uploads)"]
        B2Storage["Backblaze B2 (S3-compatible)"]
    end

    subgraph Database ["PostgreSQL Database (Prisma ORM)"]
        DB_User["User & Quota"]
        DB_Project["Project"]
        DB_Asset["Asset (Metadata, SHA256)"]
        DB_Job["ConversionJob (Queue, Lease, Heartbeat)"]
        DB_Stage["JobStage (Telemetry, Duration, Tokens)"]
        DB_Site["SiteConnection (AES-256-GCM Encrypted Creds)"]
        DB_Cache["StageCache (7-Factor Hash)"]
    end

    subgraph WorkerQueue ["Worker & Conversion Orchestrator"]
        Worker["Conversion Worker (FOR UPDATE SKIP LOCKED)"]
        Orchestrator["Conversion Orchestrator"]
        QualityGate["Deterministic Quality Gate"]
    end

    subgraph AI ["AI Subsystem"]
        AIRouter["AI Provider Router"]
        CapGuard["Capability Guard (Text vs Vision)"]
        Groq["Groq Adapter (openai/gpt-oss-120b)"]
        Gemini["Gemini Adapter (gemini-3.8-flash)"]
        OpenRouter["OpenRouter Adapter (Claude 3.5 Sonnet)"]
        MockAI["Mock AI Adapter (Offline Fixtures)"]
    end

    subgraph ElementorPipeline ["Elementor Compiler & Publisher"]
        DIR_Norm["DIR Normalizer & Schema Validator"]
        Elem_Gen["Elementor Generator (Flexbox/Grid Containers)"]
        Elem_Val["Elementor Validator & Serializer"]
        RootSkill["Operative Skill (server/ELEMENTOR_SKILL.md)"]
        MCPPub["MCP Publisher (Official Elementor Protocol)"]
    end

    subgraph RemoteWP ["Target WordPress Site (Remote)"]
        WP_MCP["WordPress 6.8+ / Elementor Pro 4.3+ MCP Endpoint"]
    end

    %% Wiring Connections
    UI_Upload --> API_Client
    UI_Project --> API_Client
    UI_Settings --> API_Client
    API_Client -->|HTTP / JSON| Server

    Routes_Upload --> MW_Upload --> ImgProc
    ImgProc --> LocalStorage
    ImgProc --> B2Storage
    Routes_Upload --> DB_Asset
    Routes_Upload --> DB_Job

    Worker -->|Claim Job| DB_Job
    Worker --> Orchestrator

    Orchestrator --> AIRouter
    AIRouter --> CapGuard
    CapGuard --> Gemini
    CapGuard --> Groq
    CapGuard --> OpenRouter
    CapGuard --> MockAI
    AIRouter <--> DB_Cache

    Orchestrator --> DIR_Norm
    DIR_Norm --> Elem_Gen
    RootSkill --> Elem_Gen
    Elem_Gen --> Elem_Val
    Elem_Val --> QualityGate
    QualityGate --> Orchestrator

    Orchestrator --> DB_Job
    Orchestrator --> DB_Stage
    Routes_Sites --> MCPPub
    MCPPub -->|JSON-RPC over SSE/HTTP| WP_MCP
```

---

## 4.4 Complete Execution Workflow

The end-to-end conversion lifecycle proceeds through the following verified stages:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant Client as Next.js Client
    participant Express as Express API Server
    participant Storage as Sharp / Storage Engine
    participant DB as PostgreSQL (Prisma)
    participant Worker as Background Worker
    participant Orchestrator as Conversion Orchestrator
    participant AI as AI Router (Gemini / Groq)
    participant Compiler as Elementor Generator
    participant WP as WordPress (MCP)

    User->>Client: Selects screenshot (PNG/JPEG) & inputs project name
    Client->>Express: POST /api/v1/upload (multipart/form-data)
    Express->>Storage: validateImage() (magic bytes, 100MP decompression check)
    Storage-->>Express: Width, height, verified MIME, SHA-256 hash
    Express->>Storage: Upload original buffer to storage path
    Express->>DB: Create Project, Asset, and ConversionJob (status: 'queued')
    Express-->>Client: 201 Created { jobId, projectId, status: 'queued' }
    Client->>Client: Redirect to /projects/:id and poll GET /api/v1/jobs/:id

    Note over Worker,DB: Worker polls DB via FOR UPDATE SKIP LOCKED
    Worker->>DB: Atomic claim next queued job (status -> 'validating_upload', set lease 3 min)
    Worker->>Orchestrator: processJob(jobId)

    Orchestrator->>AI: executeDIRStage() -> Vision request with base64 image
    AI->>AI: Check 7-factor StageCache. If miss, invoke Gemini (gemini-3.8-flash)
    AI-->>Orchestrator: Raw AI JSON output (finishReason checked)
    Orchestrator->>Orchestrator: parseDIRFromAIOutput() & normalizeDIR()
    alt Schema Validation Fails
        Orchestrator->>AI: executeDIRRepairStage() -> Structured repair prompt via Groq
        AI-->>Orchestrator: Repaired DIR JSON
        Orchestrator->>Orchestrator: normalizeDIR() & validateDIR()
    end

    Orchestrator->>Storage: resolveAndExtractAssets() -> Crop sub-assets from source buffer
    Storage->>DB: Persist cropped sub-assets in Asset table & update DIR asset placeholders

    Orchestrator->>Compiler: convertDIRToElementor(dirDoc)
    Compiler->>Compiler: Inject server/ELEMENTOR_SKILL.md, construct containers & widgets
    Compiler-->>Orchestrator: ElementorDocument v0.4 & ConversionReport

    Orchestrator->>Orchestrator: verifyVisualQuality() Quality Gate (containers > 0, widgets > 0)
    Orchestrator->>Storage: Serialize and save elementor-jobId.json artifact
    Orchestrator->>DB: Update ConversionJob (status: 'preview_ready', artifacts persisted)
    Worker->>DB: Release worker lock

    Client->>Express: GET /api/v1/jobs/:id
    Express-->>Client: Job status: 'preview_ready', dirArtifact, elementorArtifact
    Client->>User: Displays Stage Progress, DIR Tree Inspector, and Elementor Inspector

    opt Publishing to WordPress
        User->>Client: Navigates to /projects/:id/publish, confirms publish
        Client->>Express: POST /api/v1/jobs/:id/publish
        Express->>WP: Handshake initialize & tools/list
        Express->>WP: elementor_create_page or wp_create_post + elementor_set_post_data
        Express->>WP: Verification read-back
        Express-->>Client: 200 OK { publishId, remotePageId, remoteUrl }
        Client->>User: Displays success banner and direct WordPress link
    end
```

---

## 4.5 API Documentation

Base URL: `http://localhost:4000/api/v1`  
All responses return JSON with `{ "success": boolean, "data": ... }` or `{ "success": false, "error": { "message": string, "code": string } }`.

| Method | Endpoint | Purpose | Request Input | Successful Response | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Health check & uptime | None | `200 OK`<br>`{ "status": "ok", "uptime": number, "timestamp": string, "environment": string }` | None |
| `GET` | `/diagnostic` | Safe configuration diagnostics | None | `200 OK`<br>`{ "status": "ok", "storage": {...}, "ai": {...}, "worker": {...} }` | None |
| `POST` | `/auth/register` | Register new user account | JSON: `{ "email": string, "password": min 6 chars }` | `201 Created`<br>`{ "token": string, "user": { "id", "email", "role" } }` | `400` Validation error<br>`400` Email already registered |
| `POST` | `/auth/login` | Authenticate user | JSON: `{ "email": string, "password": string }` | `200 OK`<br>`{ "token": string, "user": { "id", "email", "role" } }` | `401` Invalid email or password |
| `POST` | `/auth/dev-login` | Instant local developer login | None | `200 OK`<br>`{ "token": string, "user": developer@elementor.local }` | None |
| `GET` | `/auth/me` | Fetch authenticated user profile & quota | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "id", "email", "role", "usedStorage", "storageQuota" }` | `401` Unauthorized |
| `GET` | `/projects` | List user projects | Header: `Authorization: Bearer <token>` | `200 OK`<br>`[ { "id", "name", "conversionJobs": [...] } ]` | `401` Unauthorized |
| `POST` | `/projects` | Create empty project | JSON: `{ "name": string, "description"?: string }` | `201 Created`<br>`{ "id", "name", "userId", "createdAt" }` | `400` Invalid name<br>`401` Unauthorized |
| `GET` | `/projects/:id` | Fetch project details, assets, jobs | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "id", "name", "assets": [...], "conversionJobs": [...] }` | `404` Project not found |
| `DELETE` | `/projects/:id` | Delete project and cascade records | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "success": true, "message": "Project deleted" }` | `404` Project not found |
| `POST` | `/upload` | Upload image & enqueue conversion | `multipart/form-data`: field `image` (binary) and optional `name` | `201 Created`<br>`{ "jobId", "projectId", "assetId", "status": "queued" }` | `400` Corrupt/unsupported image<br>`400` Decompression bomb (>100MP)<br>`413` Quota exceeded |
| `GET` | `/jobs/:id` | Poll conversion job status & stages | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "id", "status", "currentStage", "stages": [...] }` | `404` Job not found |
| `GET` | `/jobs/:id/dir` | Retrieve generated DIR JSON | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "version": "1.0.0", "meta": {...}, "pages": [...] }` | `404` DIR not ready |
| `GET` | `/jobs/:id/elementor` | Retrieve generated Elementor JSON | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "version": "0.4", "title": string, "content": [...] }` | `404` Elementor JSON not ready |
| `POST` | `/jobs/:id/retry` | Retry failed conversion job | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "success": true, "message": "Job retry queued" }` | `404` Job not found |
| `GET` | `/sites` | List connected WordPress sites | Header: `Authorization: Bearer <token>` | `200 OK`<br>`[ { "id", "name", "siteUrl", "isMcpAvailable", ... } ]` | `401` Unauthorized |
| `POST` | `/sites` | Register WordPress site credentials | JSON: `{ "name", "siteUrl", "username", "applicationPassword" }` | `201 Created`<br>`{ "id", "name", "siteUrl" }` (Credentials encrypted via AES-256-GCM) | `400` Validation error |
| `POST` | `/sites/:id/test` | Handshake & test MCP capabilities | Header: `Authorization: Bearer <token>` | `200 OK`<br>`{ "ok": true, "capabilities": { "wordpressVersion", "elementorVersion", "availableTools" } }` | `404` Site not found<br>`502` Target unreachable |
| `POST` | `/jobs/:jobId/publish` | Publish Elementor template to WordPress | JSON: `{ "siteConfigId", "title", "resourceType", "publishMode", "confirmPublish": true }` | `200 OK`<br>`{ "success": true, "publishId", "remotePostId", "remoteUrl" }` | `400` Unconfirmed publish<br>`404` Job/Site not found |

---

## 4.6 AI Provider and Model Workflow

### Provider Matrix & Roles
The application separates conversion into specialized stage roles handled by the `AIRouter` (`server/src/modules/ai/router.ts`):

```
Role: 'vision'     --> Google Gemini (default: gemini-3.8-flash) or OpenRouter Vision
Role: 'structure'  --> Groq (default: openai/gpt-oss-120b)
Role: 'review'     --> OpenRouter (default: anthropic/claude-3.5-sonnet)
Role: 'test'       --> MockAIAdapter (deterministic offline fixtures)
```

### Critical Model Compatibility Rules
1. **Groq Text-Only Enforcement:** `openai/gpt-oss-120b` and `llama-3.3-70b-versatile` on Groq are text-only models. `validateRequestCapabilities()` explicitly rejects image parts sent to text models, preventing fatal API rejection.
2. **Groq Deprecation Notice:** Groq decommissioned `llama-3.3-70b-versatile` on August 16, 2026. The codebase designates `openai/gpt-oss-120b` as the Groq replacement for structural JSON extraction and repair.
3. **Gemini Deprecation Notice:** `gemini-1.5-pro` and legacy endpoints return 404 on Google's v1beta API. The codebase designates `gemini-3.8-flash` (or `gemini-2.5-flash`) as the active multimodal vision model.
4. **OpenRouter Free Tier Guard:** `openrouter/free` is marked `supportsImages: false` because free upstream routes do not guarantee multimodal capability or determinism.

### Error Handling & Transient Fault Resilience
- **HTTP 429 (Rate Limit / Quota Exhaustion):** `AIRouter` parses the `Retry-After` header (default 60s) and places the offending provider in cooldown (`setProviderCooldown`), preventing retry storms.
- **HTTP 503 (Gemini High Demand / Unavailable):** Transient 503 errors trigger bounded exponential backoff (initial delay 500ms, up to 3 attempts). In offline test mode, requests never silently fall back to mock adapters when real credentials fail.
- **Output Truncation (`finishReason: 'length'`):** If a model hits max output tokens, the router logs a warning and immediately invalidates the cache key to prevent poisoned partial JSON from persisting.
- **7-Factor Composite Caching:** `StageCache` keys are computed from:
  $$\text{Key} = \text{SHA256}(\text{sourceHash} + \text{schemaVer} + \text{skillVer} + \text{promptVer} + \text{provider} + \text{model} + \text{stage})$$

---

## 4.7 DIR Generation and Validation

### Canonical Schema (`server/src/modules/dir/types.ts`)
The Design Intermediate Representation is the single source of truth for layout, style, and semantic meaning:

```typescript
export interface DIRDocument {
  version: '1.0.0';
  meta: DIRMeta;
  breakpoints: DIRBreakpoints;
  globals: DIRGlobals;
  assets: DIRAsset[];
  pages: DIRPage[];
}
```

- **Section Roles (18):** `header`, `navigation`, `hero`, `feature`, `content`, `cta`, `testimonial`, `pricing`, `stats`, `gallery`, `team`, `faq`, `contact`, `form`, `footer`, `banner`, `logo-bar`, `generic`.
- **Node Kinds (26):** `container`, `flex-group`, `grid-group`, `heading`, `text`, `button`, `image`, `icon`, `icon-text`, `link`, `list`, `list-item`, `divider`, `spacer`, `card`, `form`, `input`, `video`, `map`, `social-icons`, `counter`, `progress-bar`, `tabs`, `accordion`, `rating`, `badge`, `unknown`.
- **Typography & Color:** Colors defined as hex strings. Typography defined with font families, weights, font sizes, line heights, and letter spacings.
- **Responsive Overrides:** Optional per-node overrides for `tablet` and `mobile` devices.

### Normalization & Repair Pipeline (`server/src/modules/dir/normalizer.ts`)
Raw AI responses frequently suffer from JSON hallucinations. The deterministic normalizer applies 8 structural repairs:
1. **Pages/Sections Disentanglement:** Fixes models returning sections directly under `pages` array instead of inside `pages[0].sections`.
2. **CSS Margin/Padding Flattening:** Converts split keys (`marginTop`, `marginBottom`) into standard `DIRSpacing` objects (`{ top, right, bottom, left }`).
3. **Numeric Coercion:** Coerces string-encoded numbers (e.g. `"16px"`, `"700"`) into pure numbers.
4. **Border & Radius Sanitization:** Normalizes border widths and corner radii.
5. **Heading Level Normalization:** Ensures heading levels fall strictly between 1 and 6.
6. **Text HTML Wrapping:** Wraps raw strings in `<p>` tags if `html` is absent.
7. **Grid Columns Calculation:** Infers grid columns from children count when omitted.
8. **Pruning Unrecognized Keys:** Strips rogue keys to satisfy strict Zod `.strict()` schema constraints.

---

## 4.8 DIR-to-Elementor Conversion

### Mapping Rules
The compiler (`server/src/modules/elementor/generator.ts`) transforms DIR nodes into native Elementor structures:

| DIR Node Kind | Elementor `elType` | Elementor `widgetType` / Setting | Key Mappings |
| :--- | :--- | :--- | :--- |
| `container` / `flex-group` | `container` | `container_type: 'flex'` | Direction (`row`/`column`), align items, justify content, flex wrap |
| `grid-group` | `container` | `container_type: 'grid'` | Columns grid (`fr`), tablet reflow, mobile single-column reflow |
| `heading` | `widget` | `heading` | Title text, HTML tag (`h1`-`h6`), custom typography, color |
| `text` | `widget` | `text-editor` | HTML editor content, typography, alignment |
| `button` | `widget` | `button` | Text, URL, size, border radius, background color, text color |
| `image` | `widget` | `image` | Resolved image URL from cropped asset, image size (`full`), alt text |
| `icon` | `widget` | `icon` | FontAwesome 5/6 mapping (e.g. `sun` -> `fas fa-sun`), color, size |
| `icon-text` | `widget` | `icon-box` | Icon, title, description, layout position |
| `list` | `widget` | `icon-list` | Repeater items with text and icons |
| `nav group` (links) | `widget` | `icon-list` (inline) | View `inline`, space between items, custom typography |
| `divider` | `widget` | `divider` | Weight, color, style (`solid`, `dashed`) |
| `spacer` | `widget` | `spacer` | Height in pixels |
| `counter` | `widget` | `counter` | Starting number, ending number, prefix, suffix, title |
| `progress-bar` | `widget` | `progress` | Percent value, inner text |
| `social-icons` | `widget` | `social-icons` | Repeater icons with social network brands and URLs |
| `tabs` | `widget` | `tabs` | Repeater tab titles and tab content |
| `accordion` | `widget` | `accordion` | Repeater accordion titles and text bodies |
| `map` | `widget` | `google_maps` | Address query, zoom level, height |
| `video` | `widget` | `video` | Video URL, video type (`youtube`, `vimeo`) |
| `rating` | `widget` | `star-rating` | Rating score, scale (0-5) |

### Responsive Setting Propagation
The generator computes three-tier responsive settings for every layout container and widget:
- Desktop: Base setting (e.g. `width`, `padding`, `margin`).
- Tablet: Suffix `_tablet` (e.g. `width_tablet`, `padding_tablet` scaled by 0.75).
- Mobile: Suffix `_mobile` (e.g. `width_mobile`, `padding_mobile` scaled by 0.5 with 12px minimum).

### Elementor Core vs Pro Constraints
- Generated templates target **Elementor Core 4.3.5** native Flexbox Containers.
- Does not require third-party add-on plugins (Essential Addons, Ultimate Addons).
- When advanced form nodes or theme-builder elements are detected, the generator applies standard Core fallbacks or containers rather than corrupting the template.

---

## 4.9 Database and Job Lifecycle

The application uses PostgreSQL managed via Prisma (`server/prisma/schema.prisma`).

```
  [queued]
     │
     ▼ (claimed by worker via FOR UPDATE SKIP LOCKED)
[validating_upload]
     │
     ▼
[analyzing_image]
     │
     ▼
 [dir_ready]
     │
     ▼
[generating_elementor]
     │
     ▼
[validating_elementor]
     │
     ▼
 [preview_ready] ───────► [failed] (if quality gate fails)
     │                       ▲
     ▼ (user confirms)       │ (if publish fails)
 [publishing] ───────────────┘
     │
     ▼
 [published]
```

### PostgreSQL-Backed Worker Queue Semantics
- **Atomic Lease Acquisition:** The worker executes `WITH next_job AS (SELECT id FROM "ConversionJob" WHERE status IN ('queued', 'retrying') AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < NOW()) LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE ... RETURNING *`.
- **Heartbeat & Lease Refresh:** Active jobs pulse every 30 seconds (`lastHeartbeat = NOW()`, `leaseExpiresAt = NOW() + INTERVAL '3 minutes'`).
- **Crash Recovery:** If a worker crashes or encounters an unhandled exception, its lease expires after 3 minutes. Another worker automatically reclaims the job without data loss.
- **Retry Limiting:** Jobs retry up to `CONVERSION_MAX_ATTEMPTS` (default 3) with status `'retrying'`. Upon exhaustion, status transitions permanently to `'failed'`.

---

## 4.10 Storage and Asset Management

### Storage Providers
- **Local Storage (`local`):** Default development adapter. Stores files on the local filesystem under `LOCAL_STORAGE_PATH` (default `./storage/uploads`).
- **Backblaze B2 (`b2`):** Production cloud adapter utilizing `@aws-sdk/client-s3` targeting Backblaze's S3-compatible API.

### File Organization
```
storage/uploads/
└── projects/
    └── {projectId}/
        ├── originals/
        │   └── {sha256}_{filename}.png     # Original uploaded mockup
        ├── assets/
        │   └── {assetId}_{hash8}.png       # Cropped sub-assets (logos, heroes)
        └── elementor-{jobId}.json          # Final Elementor template artifact
```

---

## 4.11 Installation and Local Execution

### Prerequisites
- **Node.js:** v20.x or v22.x LTS (tested on Node v20.x).
- **Package Manager:** `npm` v10+.
- **Database:** PostgreSQL 14+ running locally or in Docker.
- **Operating System:** Windows, macOS, or Linux.

### Initial Setup Runbook

```bash
# 1. Clone the repository and enter directory
cd "IMG_PROJECT"

# 2. Install dependencies across root, server, and client
npm install
cd server && npm install
cd ../client && npm install
cd ..

# 3. Configure environment files
cp .env.example .env
cp server/.env.example server/.env

# Edit server/.env to ensure DATABASE_URL matches your local PostgreSQL:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/design_to_elementor"
# JWT_SECRET="super-secret-development-jwt-token-key-32-chars-long"
# SITE_CREDENTIAL_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# 4. Run database migrations and generate Prisma client
npm run db:migrate
npm run db:generate

# 5. Start development servers
# Option A: Run everything concurrently from root
npm run dev

# Option B: Run in separate terminals (recommended for debugging)
# Terminal 1 (Backend API):
cd server && npm run dev

# Terminal 2 (Background Conversion Worker):
cd server && npm run worker

# Terminal 3 (Next.js Frontend):
cd client && npm run dev
```

### URLs
- Frontend Web App: `http://localhost:3000`
- Backend REST API: `http://localhost:4000/api/v1`
- Backend Health Check: `http://localhost:4000/api/v1/health`

---

## 4.12 Environment Variables Reference

| Variable | Scope | Required? | Purpose | Safe Example / Default |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Server | Optional | Application runtime environment | `development` / `production` / `test` |
| `API_PORT` | Server | Optional | Port for Express API server | `4000` |
| `WEB_ORIGIN` | Server | Optional | Allowed CORS origin for frontend | `http://localhost:3000` |
| `DATABASE_URL` | Server | **Required** | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/design_to_elementor` |
| `JWT_SECRET` | Server | **Required** | Secret key for signing auth tokens (min 32 chars) | `replace-with-a-random-32-char-secret-key-here` |
| `UPLOAD_MAX_BYTES` | Server | Optional | Maximum allowed upload size (bytes) | `524288000` (500 MB) |
| `UPLOAD_QUOTA_BYTES`| Server | Optional | Per-user storage quota limit (bytes) | `2147483648` (2 GB) |
| `LOCAL_STORAGE_PATH`| Server | Optional | Filesystem path for local uploads | `./storage/uploads` |
| `STORAGE_PROVIDER` | Server | Optional | Active storage backend | `local` or `b2` |
| `B2_BUCKET_NAME` | Server | If `b2` | Backblaze B2 bucket name | `design-to-elementor` |
| `B2_ENDPOINT` | Server | If `b2` | Backblaze S3 endpoint URL | `https://s3.us-east-005.backblazeb2.com` |
| `B2_REGION` | Server | If `b2` | Backblaze S3 region | `us-east-005` |
| `B2_APPLICATION_KEY_ID` | Server | If `b2` | Backblaze application key ID | `placeholder-key-id` |
| `B2_APPLICATION_KEY` | Server | If `b2` | Backblaze application key | `placeholder-key` |
| `AI_PROVIDER` | Server | Optional | Primary AI provider for generation | `groq` |
| `AI_API_KEY` | Server | Optional | Groq API key | `gsk_placeholder` |
| `AI_MODEL` | Server | Optional | Default model identifier | `openai/gpt-oss-120b` |
| `GROQ_MODEL` | Server | Optional | Groq-specific model identifier | `openai/gpt-oss-120b` |
| `GEMINI_API_KEY` | Server | Optional | Google Gemini API key | `AIzaSy_placeholder` |
| `ENABLE_GEMINI` | Server | Optional | Enable Gemini provider adapter | `true` |
| `GEMINI_MODEL` | Server | Optional | Gemini model identifier | `gemini-3.8-flash` |
| `OPENROUTER_API_KEY`| Server | Optional | OpenRouter API key | `sk-or-placeholder` |
| `OPENROUTER_MODEL` | Server | Optional | OpenRouter model identifier | `anthropic/claude-3.5-sonnet` |
| `SITE_CREDENTIAL_ENCRYPTION_KEY` | Server | **Required** | 32-byte hex key for AES-256-GCM encryption of site passwords | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` |
| `CONVERSION_WORKER_CONCURRENCY` | Server | Optional | Number of concurrent jobs per worker | `2` |
| `CONVERSION_MAX_ATTEMPTS` | Server | Optional | Max retry attempts before permanent job failure | `3` |
| `RUN_LIVE_AI_TESTS` | Server | Optional | Toggle live AI API calls during test suite | `false` |
| `NEXT_PUBLIC_API_URL` | Client | Optional | Base URL of backend API for client requests | `http://localhost:4000` |

---

## 4.13 Testing and Verification Results

All tests run **100% offline** without network dependencies or live API keys.

### Audit Test Execution Summary
Executed on October 15, 2026:

```text
======================================================================
1. Server Test Suite (cd server && npm test)
   Test Files: 23 passed (23)
   Tests:      209 passed (209)
   Duration:   25.30s
   Highlights:
     - elementor-generation.test.ts (16 tests passed)
     - gym-landing-reconciliation.test.ts (3 tests passed)
     - widget-reconciliation.test.ts (6 tests passed)
     - gemini-model-resolution.test.ts (8 tests passed)
     - groq-model-deprecation.test.ts (13 tests passed)
     - mcp-publishing.test.ts (5 tests passed - MOCK MCP TESTED)
     - ai-routing-and-skills.test.ts (11 tests passed)
     - responsive-pipeline.test.ts (13 tests passed)
     - visual-fidelity.test.ts (6 tests passed)
     - dir-schema.test.ts (22 tests passed)
     - gemini-fallback-and-cache.test.ts (9 tests passed)
     - dir-schema-repair-and-truncation.test.ts (18 tests passed)
     - e2e-pipeline.test.ts (5 tests passed)
     - conversion-quality-gate.test.ts (8 tests passed)
     - master-skill-pipeline.test.ts (12 tests passed)
     - storage.test.ts (21 tests passed)

======================================================================
2. Client Test Suite (cd client && npm test)
   Test Files: 2 passed (2)
   Tests:      12 passed (12)
   Duration:   29.98s
   Highlights:
     - ui-components.test.tsx (6 tests passed)
     - inspectors.test.tsx (6 tests passed)

======================================================================
3. Server Typecheck (cd server && npm run typecheck)
   Output: tsc --noEmit exited with code 0 (0 errors).

======================================================================
4. Server Production Build (cd server && npm run build)
   Output: tsc exited with code 0, compiled to server/dist/.

======================================================================
5. Client Production Build (cd client && npm run build)
   Output: Next.js 14.2 compiled 8 static and dynamic routes successfully.
```

---

## 4.14 Known Issues, Discrepancies & Risks

| Issue ID | Description | Affected Area | Impact | Verified Workaround | Recommended Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | **Publish Route Signature Mismatch** | `client/src/lib/api.ts` vs `server/src/routes/sites.ts` | Client calls `POST /publish` with `{ projectId, siteConnectionId }`, but backend exposes `POST /jobs/:jobId/publish` expecting `{ siteConfigId, confirmPublish: true }`. | Publish directly via API curl using backend route format. | Refactor client `api.publish.publish` to call `/jobs/${jobId}/publish` and supply `confirmPublish: true`. |
| **ISSUE-02** | **Site Registration Payload Mismatch** | `client/src/app/settings/page.tsx` vs `server/src/routes/sites.ts` | Client submits nested `{ credentials: { username, applicationPassword } }`, but server Zod schema expects flat fields. | Flatten payload in API client or update server schema with `.or()`. | Update `siteCreateSchema` in `sites.ts` to accept either flat or nested credential objects. |
| **ISSUE-03** | **Unimplemented Usage Endpoints** | `client/src/lib/api.ts` (`api.usage.*`) | Client defines usage dashboard calls, but Express router has no `/usage` or `/settings/config` route handlers. | Client UI falls back gracefully or ignores missing usage stats. | Implement `usageRouter` in server aggregating token usage from `JobStage` table. |
| **ISSUE-04** | **Complex SVG & Clip-Path Loss** | `server/src/modules/elementor/generator.ts` | Complex custom vector shapes and organic SVG clip-paths in reference designs cannot be natively mapped to Core Elementor containers without custom CSS. | Renders as standard rectangular container with solid or gradient background. | Implement custom CSS property emission on Elementor container settings. |
| **ISSUE-05** | **Live MCP Publishing Requires Staging Site** | `server/src/modules/mcp/` | Live WordPress publishing is tested against `MockMCPServer` in test suites; real remote publishing requires WordPress 6.8+ and Elementor 4.3+ with active Application Passwords. | Use mock tests for CI/CD; perform manual staging testing for live site verification. | Provide Dockerized WordPress/Elementor test container for automated live integration tests. |

---

## 4.15 Completed Work and Remaining Roadmap

### Completed & Verified
- Full-stack monorepo architecture with clean TypeScript types.
- Multipart upload pipeline with magic byte validation, 100MP decompression guard, and SHA-256 deduplication.
- Canonical DIR Schema (`v1.0.0`) with Zod validator and 8-stage deterministic normalizer.
- Multi-provider AI abstraction supporting Groq, Gemini, OpenRouter, and Mock with rate-limit cooldowns.
- Authoritative Operative Skill injection (`server/ELEMENTOR_SKILL.md`).
- Elementor generator producing native v0.4 Flexbox/Grid templates across 20+ widgets.
- Deterministic quality gate enforcing container, widget, and asset URL presence.
- PostgreSQL-backed worker queue with atomic `FOR UPDATE SKIP LOCKED` locking, heartbeats, and bounded retries.
- Next.js 14 dashboard, upload dropzone, polling stage progress, and dual DIR/Elementor inspectors.
- MCP client and publisher with handshake, dynamic tool discovery, error handling, and read-back verification.

### Prioritized Roadmap to Production Readiness

```mermaid
flowchart LR
    P1["Phase 1: Contract Alignment"] --> P2["Phase 2: Visual Canvas"]
    P2 --> P3["Phase 3: Automated Staging"]
    P3 --> P4["Phase 4: Multi-Tenant Hardening"]

    classDef done fill:#10b981,stroke:#059669,color:#fff;
    classDef curr fill:#3b82f6,stroke:#2563eb,color:#fff;
    classDef planned fill:#6b7280,stroke:#4b5563,color:#fff;

    class P1 curr;
    class P2,P3,P4 planned;
```

1. **Phase 1: Contract Alignment (Immediate)**
   - Reconcile `client/src/lib/api.ts` `/publish` and `/sites` payload formats with server schemas.
   - Implement `/api/v1/usage/summary` backend endpoint aggregating `JobStage.tokensUsed`.
2. **Phase 2: Visual Canvas & Side-by-Side Diffing**
   - Embed an interactive iframe or canvas renderer allowing users to visually inspect the Elementor layout alongside the uploaded screenshot before publishing.
3. **Phase 3: Automated Staging CI/CD**
   - Provide a `docker-compose.wordpress.yml` environment with WordPress 6.8 and Elementor Core to run live MCP publishing integration tests in CI.
4. **Phase 4: Multi-Tenant Hardening & Scaling**
   - Implement refresh token rotation, email verification, and pluggable Redis adapter for worker coordination in horizontally scaled clusters.

---

## 4.16 Security, Reliability and Production Readiness

### Security Controls
- **Zero Raw Secrets in Source Control:** `.env` files are ignored by `.gitignore`. Example files contain only safe placeholders.
- **Credential Encryption at Rest:** WordPress application passwords are encrypted using **AES-256-GCM** with unique IVs and authenticated tags via `SITE_CREDENTIAL_ENCRYPTION_KEY`.
- **Upload Decompression Bomb Protection:** Sharp enforces `MAX_PIXELS_LIMIT = 100_000_000` (100 MP) and checks authentic magic bytes to prevent pixel flood attacks.
- **Quota Enforcement:** Users are bounded by `UPLOAD_QUOTA_BYTES` (default 2GB) tracked in PostgreSQL before storage persistence.
- **Explicit Publishing Consent:** Publishing requires explicit user confirmation (`confirmPublish: true`), preventing automated or accidental remote WordPress page overwrites.

### Reliability Mechanisms
- **Lease Timeout & Crash Recovery:** In-flight worker jobs have a 3-minute lease. Dead worker jobs are automatically reclaimed by healthy instances.
- **Deterministic Quality Gates:** Conversions cannot pass silently with 0 elements or broken image URLs.
- **Cache Isolation:** Caching utilizes a 7-factor composite hash preventing cross-model or cross-prompt cache poisoning.

---

## 4.17 Glossary

- **DIR (Design Intermediate Representation):** The canonical JSON schema (`v1.0.0`) representing a visual web design as an abstract, framework-agnostic tree of sections, nodes, styles, and assets.
- **Elementor JSON:** The official template JSON envelope (`v0.4`) consumed by the WordPress Elementor editor, structured as nested containers and widgets.
- **ConversionJob:** A PostgreSQL database record tracking the lifecycle, status, attempts, leases, and artifacts of a single design conversion.
- **JobStage:** An individual lifecycle checkpoint (`image_analysis`, `dir_generation`, `elementor_generation`, etc.) recording execution duration, token usage, and AI provider metadata.
- **MCP (Model Context Protocol):** An open protocol developed by Anthropic enabling standardized JSON-RPC communication between AI systems and external tools (such as WordPress/Elementor).
- **Operative Skill:** The comprehensive engineering guide (`server/ELEMENTOR_SKILL.md`) defining Elementor Core 4.3.5 compatibility rules, control IDs, and container structures.
- **Deterministic Quality Gate:** A programmatic validation function (`verifyVisualQuality`) executed before final template persistence to prevent empty or structurally broken pages from being published.

---

## 4.18 Information for a New LLM or Instructor (Developer Handoff)

### 1. What is the project's objective?
Convert webpage screenshots (`PNG`/`JPEG`) into fully editable, native Elementor JSON templates and publish them to WordPress via MCP without manual page recreation.

### 2. What architecture is actually implemented?
A Next.js 14 frontend and an Express + PostgreSQL backend. Conversion jobs are enqueued in PostgreSQL and processed asynchronously by a background worker utilizing `FOR UPDATE SKIP LOCKED`. Sharp processes images, Gemini performs vision analysis, Groq performs JSON structure repair, and an internal compiler generates native Elementor containers and widgets.

### 3. What is the complete execution path?
`User Upload` $\rightarrow$ `Image Validation & Hash` $\rightarrow$ `DB Enqueue` $\rightarrow$ `Worker Claim` $\rightarrow$ `Gemini Vision (DIR)` $\rightarrow$ `DIR Normalizer & Zod Validation` $\rightarrow$ `Sub-Asset Cropping` $\rightarrow$ `Elementor Compiler (Skill Injected)` $\rightarrow$ `Quality Gate` $\rightarrow$ `Artifact Storage` $\rightarrow$ `Client Inspector / MCP WordPress Publish`.

### 4. Which components are working and which are not?
- **Working:** Image intake, decompression guard, DIR generation, DIR normalization/repair, sub-asset cropping, Elementor template generation, quality gate, offline test suites (221 passing tests), local build pipelines.
- **Working with Mocks:** MCP publishing (verified against `MockMCPServer`; live publishing requires a real WordPress site).
- **Not Implemented / Desynchronized:** Figma/code input (not implemented); Client `/publish` and `/settings` API payloads have minor schema mismatches with backend routes.

### 5. What important implementation decisions must not be changed casually?
- **Do not invent parallel DIR schemas:** `server/src/modules/dir/types.ts` is the authoritative schema contract.
- **Do not send images to Groq:** `openai/gpt-oss-120b` is text-only. Vision requests must go to Gemini.
- **Do not remove server/ELEMENTOR_SKILL.md:** The Elementor compiler depends on this exact file for prompt injection and throws if missing.
- **Do not remove FOR UPDATE SKIP LOCKED:** The PostgreSQL queue guarantees atomic single-worker execution without Redis.

### 6. Which files are the most important entry points?
- Server Entry: `server/src/index.ts`
- Worker Entry: `server/src/worker.ts`
- Orchestrator: `server/src/modules/conversion/orchestrator.ts`
- Canonical DIR: `server/src/modules/dir/types.ts` & `server/src/modules/dir/schema.ts`
- Elementor Generator: `server/src/modules/elementor/generator.ts`
- Client Entry: `client/src/app/page.tsx`
- Client API: `client/src/lib/api.ts`

### 7. What are the main known issues?
- Client `/publish` form sends `{ projectId, siteConnectionId }` to `/publish`, but backend route is `POST /jobs/:jobId/publish`.
- Client `/settings` site creation form nests `{ credentials: { username, password } }` instead of flat parameters.
- Complex organic SVG clip-paths in screenshots fall back to rectangular container bounds.

### 8. What should the next developer or LLM investigate first?
1. Open `client/src/lib/api.ts` and `client/src/app/projects/[id]/publish/page.tsx` and align the publish call with `server/src/routes/sites.ts` (`POST /api/v1/jobs/:jobId/publish`).
2. Update `server/src/routes/sites.ts` `siteCreateSchema` to accept nested credentials to match the frontend form.
3. Connect a real WordPress 6.8+ / Elementor 4.3+ staging site to test end-to-end live MCP publishing.

