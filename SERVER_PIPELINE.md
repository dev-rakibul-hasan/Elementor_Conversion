# Design-to-Elementor: Complete Backend Pipeline Step-by-Step

This document describes the exact execution flow of the entire backend conversion pipeline, ordered chronologically from the initial client upload to final WordPress publishing. Every step explains what happens, which source code file handles it, and how data moves forward.

---

### Step 1: Client Upload Request Intake
- **Handler File:** `server/src/routes/upload.ts`
- **What Happens:** The user submits a design mockup (`.png`, `.jpg`, `.jpeg`) from the frontend via a `POST /api/v1/upload` multipart request.
- **Details:** The request passes through the `requireAuth` middleware. The `getAuthenticatedUserId(req)` helper extracts the verified user ID from the JWT Bearer token. If the token is missing or invalid, an `AuthError` (HTTP 401) is returned immediately.

---

### Step 2: In-Memory File Buffering
- **Handler File:** `server/src/middleware/upload.ts`
- **What Happens:** Multer parses the multipart form data using memory storage (`multer.memoryStorage()`).
- **Details:** The file stream is buffered directly in RAM as a Node.js `Buffer`. No unvalidated files are written to the physical disk at this stage, preventing malicious temporary file exploits.

---

### Step 3: Magic Bytes Verification
- **Handler File:** `server/src/modules/storage/image-processor.ts` (`checkMagicBytes`)
- **What Happens:** The system inspects the raw binary header bytes of the buffered file.
- **Details:** It checks for authentic file signatures (`0x89 0x50 0x4E 0x47` for PNG, `0xFF 0xD8 0xFF` for JPEG, and `RIFF...WEBP` for WebP). If an executable or malicious script is disguised as an image file (e.g., `virus.exe` renamed to `image.png`), it is rejected with a `ValidationError` (HTTP 400).

---

### Step 4: Decompression Bomb and Dimension Guard
- **Handler File:** `server/src/modules/storage/image-processor.ts` (`validateImage`)
- **What Happens:** Sharp opens the image metadata in memory to verify resolution and dimensions.
- **Details:** The system checks that `width * height <= 100,000,000` (100-Megapixel limit). This protects the server from "decompression bomb" attacks where tiny compressed files expand into gigabytes of RAM during decompression.

---

### Step 5: EXIF Orientation Normalization
- **Handler File:** `server/src/modules/storage/image-processor.ts` (`normalizeImageOrientation`)
- **What Happens:** Sharp inspects the EXIF metadata for orientation tags (common in mobile and camera captures).
- **Details:** The image is rotated into the upright display orientation, and EXIF tags are stripped. This ensures all downstream pixel coordinates, AI bounding boxes, and visual measurements match the true pixel grid.

---

### Step 6: User Storage Quota Reservation
- **Handler File:** `server/src/modules/storage/accounting.ts` (`reserveStorage`)
- **What Happens:** The system checks if the user has enough remaining storage quota for the new file.
- **Details:** Within a Prisma database transaction, an atomic row-level lock is placed on the `User` record (`SELECT id FROM "User" WHERE id = ... FOR UPDATE`). It verifies that `user.usedStorage + fileSizeBytes <= user.storageQuota`. If the quota is exceeded, an `AppError` (HTTP 413) is thrown and the upload is aborted.

---

### Step 7: Storage Key Generation and Path Traversal Neutralization
- **Handler File:** `server/src/modules/storage/local.ts` (`LocalStorageAdapter.getSafePath`)
- **What Happens:** A unique storage path is generated: `projects/:projectId/originals/:uuid_:filename`.
- **Details:** In `LocalStorageAdapter.getSafePath`, any leading slashes or backslashes are stripped using `key.replace(/^[/\\]+/, '')`. The system verifies using `path.relative` that the target path remains strictly within the designated storage directory, neutralizing directory traversal attacks (`../../etc/passwd`).

---

### Step 8: Asset File Upload and SHA-256 Hashing
- **Handler File:** `server/src/modules/storage/local.ts` / `server/src/modules/storage/b2.ts`
- **What Happens:** The file buffer is written to persistent storage, and an SHA-256 content hash is computed.
- **Details:** If `STORAGE_PROVIDER=local`, the file is written to `./storage/uploads/`. If `STORAGE_PROVIDER=b2`, the file is uploaded to the Backblaze B2 cloud bucket via the S3-compatible client. The SHA-256 checksum is stored for deduplication and cache validation.

---

### Step 9: Database Asset and Job Enqueuing
- **Handler File:** `server/src/routes/upload.ts`
- **What Happens:** Database records are created in PostgreSQL using Prisma.
- **Details:** An `Asset` record is saved with pixel dimensions, file size, SHA-256 hash, and storage key. Then, a `ConversionJob` record is created with `status: 'queued'`, `attempts: 0`, and `maxAttempts: 3`. The HTTP request finishes, returning HTTP 201 Created with the `jobId` to the client.

---

### Step 10: Background Worker Queue Polling
- **Handler File:** `server/src/worker.ts` (`ConversionWorker.start`)
- **What Happens:** An independent background worker daemon continuously checks the database for queued conversion tasks.
- **Details:** The worker loop runs on a 2-second interval (`POLL_INTERVAL_MS = 2000`). It checks if the number of active jobs is below the configured concurrency limit (`CONVERSION_WORKER_CONCURRENCY = 2`). If a slot is available, it attempts to acquire a job.

---

### Step 11: Optimistic Row Locking with SKIP LOCKED
- **Handler File:** `server/src/worker.ts` (`acquireJob`)
- **What Happens:** The worker queries PostgreSQL for the oldest queued job without colliding with other worker processes.
- **Details:** The worker executes an atomic raw SQL statement:
  `SELECT id FROM "ConversionJob" WHERE status = 'queued' AND "deletingAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
  PostgreSQL locks that specific row and hides it from any concurrent worker queries, eliminating race conditions without requiring an external Redis lock manager.

---

### Step 12: Worker Lease Timestamping and Slot Allocation
- **Handler File:** `server/src/worker.ts`
- **What Happens:** The acquiring worker claims exclusive ownership of the job.
- **Details:** The worker updates the job record: `status = 'processing'`, `workerId = <unique_worker_id>`, `lockedAt = NOW()`, `leaseExpiresAt = NOW() + 3 minutes`, and `attempts = attempts + 1`. The active job counter increments, and the conversion orchestrator is invoked in an asynchronous background slot.

---

### Step 13: 30-Second Heartbeat Pulse Initialization
- **Handler File:** `server/src/worker.ts` (`startHeartbeat`)
- **What Happens:** A background heartbeat timer is started for the running job.
- **Details:** Every 30 seconds (`HEARTBEAT_INTERVAL_MS`), the timer pulses the database by updating `lastHeartbeat = NOW()` and pushing `leaseExpiresAt` forward by 3 minutes. If the worker process crashes or the server loses power, the heartbeat stops, allowing the stale lease reaper to detect the expired lease and re-queue the job.

---

### Step 14: Original Image Retrieval and Tiling Evaluation
- **Handler File:** `server/src/modules/conversion/orchestrator.ts` & `image-processor.ts` (`createTiles`)
- **What Happens:** The orchestrator retrieves the original image buffer from storage and checks its physical proportions.
- **Details:** If the image height is greater than 2400px or the aspect ratio is taller than 2:1 (typical for full landing page screenshots), `createTiles` slices the image vertically into overlapping strips with a 200px boundary overlap. This ensures buttons and headings that sit on a slice boundary are never cut in half during vision analysis.

---

### Step 15: Stage 1 — Vision Analysis Cache Check
- **Handler File:** `server/src/modules/ai/cache.ts` (`computeStageCacheKey`)
- **What Happens:** The system checks if this exact image and prompt combination has already been analyzed.
- **Details:** A 7-factor composite SHA-256 hash is computed from: image SHA-256, AI provider name, model name, prompt text hash, schema version, temperature, and options. If a matching record with complete output is found in the `StageCache` table, the LLM call is bypassed, and the cached vision JSON is loaded immediately.

---

### Step 16: Stage 1 — Vision AI Layout Decomposition
- **Handler File:** `server/src/modules/conversion/orchestrator.ts` & `modules/ai/providers/gemini.ts`
- **What Happens:** Google Gemini Flash (`gemini-3.8-flash`) analyzes the design image layout.
- **Details:** The image (or tiles) and the structured vision prompt are sent to Gemini. The model identifies page sections, grid columns, typography hierarchies, color schemes, and component bounding box coordinates. A telemetry record is created in the `JobStage` table recording stage duration and token counts.

---

### Step 17: Stage 2 — Model Capability Guard and Input Sanitization
- **Handler File:** `server/src/modules/ai/capabilities.ts` (`sanitizeRequestForModel`)
- **What Happens:** The AI Router prepares the vision analysis data for Stage 2 structural synthesis.
- **Details:** Stage 2 routes to high-speed text models (such as Groq's `openai/gpt-oss-120b`). The capability guard checks the model registry (`supportsVision: false`) and automatically strips binary image attachments from the payload. This prevents Groq from throwing HTTP 400 errors for unsupported multi-modal inputs.

---

### Step 18: Stage 2 — Structural DIR Synthesis
- **Handler File:** `server/src/modules/conversion/orchestrator.ts` & `modules/ai/providers/groq.ts`
- **What Happens:** Groq compiles the vision analysis into a structured Design Intermediate Representation (DIR) JSON document.
- **Details:** The model outputs a complete tree structure containing global styles, semantic section roles (`header`, `hero`, `features`, `pricing`, `footer`), container flex layouts, and individual element nodes (`heading`, `text`, `button`, `image`, `icon_box`, `card`).

---

### Step 19: Regex JSON Block Extraction
- **Handler File:** `server/src/modules/conversion/orchestrator.ts`
- **What Happens:** The raw text response from the AI is cleaned and extracted.
- **Details:** If the LLM returned markdown code fences (` ```json ... ``` `) or conversational prefixes (e.g., "Here is your JSON:"), regular expressions extract the largest outermost bracketed `{ ... }` block to ensure valid JSON syntax before parsing.

---

### Step 20: Canonical DIR Schema Validation
- **Handler File:** `server/src/modules/dir/schema.ts` (`dirDocumentSchema.safeParse`)
- **What Happens:** The extracted JSON is checked against the authoritative Zod schema.
- **Details:** Zod validates that the document has `version: '1.0.0'`, valid metadata, global color/font dictionaries, at least one section, and that all 26 supported node types conform to their property requirements.

---

### Step 21: Deterministic AST Normalization
- **Handler File:** `server/src/modules/dir/normalizer.ts` (`normalizeDIRDocument`)
- **What Happens:** If schema validation encounters minor formatting flaws, the programmatic normalizer repairs them.
- **Details:** The normalizer coerces numeric strings into numbers, standardizes CSS units (`px`, `%`, `rem`), maps color strings into valid hex codes, defaults missing container padding, and assigns fallback UUIDs to nodes missing identifiers.

---

### Step 22: Targeted Section-Level AI Repair Loop
- **Handler File:** `server/src/modules/conversion/prompts.ts` (`createSectionRepairPrompt`)
- **What Happens:** If programmatic normalization cannot fix a complex schema error, an AI self-healing loop runs.
- **Details:** Rather than re-running the entire conversion pipeline from scratch, the orchestrator isolates only the specific invalid section. It sends a targeted repair prompt containing the exact Zod error paths and broken section JSON to the AI. Once repaired, the section is spliced back into the DIR document.

---

### Step 23: Sub-Asset Pixel Cropping and Storage Synchronization
- **Handler File:** `server/src/modules/conversion/asset-bounds.ts` (`reconcileAssetBounds`)
- **What Happens:** Discrete images (logos, icons, hero illustrations) are cropped directly from the original uploaded screenshot.
- **Details:** The function scans the DIR tree for `image` nodes that specify pixel coordinates (`sourceRect: { x, y, width, height }`). Sharp crops these sub-assets from the original image buffer, saves them into storage (`projects/:id/assets/:uuid.png`), and replaces `sourceRect` with permanent relative storage URLs (`/storage/...`).

---

### Step 24: Stage 3 — Elementor 3.x Flexbox Compilation
- **Handler File:** `server/src/modules/elementor/generator.ts` (`ElementorGenerator.generate`)
- **What Happens:** The validated DIR document is compiled into native Elementor 3.x / 4.x Flexbox Container JSON.
- **Details:** The generator maps DIR sections into root Flexbox containers (`elType: 'container'`). Flex directions (`row`, `column`), wrap settings, alignment, and gaps are mapped to Elementor controls. DIR nodes are mapped to native widgets (`heading`, `text-editor`, `button`, `image`, `icon-box`, `container`). Every element is assigned a unique 8-character hexadecimal ID (`generateElementId`).

---

### Step 25: Elementor Document and Responsive Validation
- **Handler File:** `server/src/modules/elementor/validator.ts` & `consistency-validator.ts`
- **What Happens:** The compiled Elementor structure is checked for schema compliance.
- **Details:** It asserts that container nesting depth does not exceed limits, all element IDs are strictly unique, widget names exist in the Elementor Core registry, and responsive rules (`_tablet`, `_mobile`) conform to `responsive-capabilities.json`.

---

### Step 26: Stage 4 — AI Fidelity Review
- **Handler File:** `server/src/modules/conversion/orchestrator.ts` & `modules/ai/providers/openrouter.ts`
- **What Happens:** Claude 3.5 Sonnet reviews the compiled Elementor structure against the original visual design requirements.
- **Details:** The model assesses visual alignment, spacing proportions, and hierarchy, providing feedback and a fidelity score stored in the stage telemetry.

---

### Step 27: Content Preservation Audit
- **Handler File:** `server/src/modules/conversion/content-audit.ts` (`auditContentFidelity`)
- **What Happens:** The system cross-compares text content between the DIR and the compiled Elementor template.
- **Details:** It traverses all headings, paragraphs, and button labels to verify that no words or copy from the user's design were dropped, truncated, or lost during compilation.

---

### Step 28: Deterministic Quality Gate Evaluation
- **Handler File:** `server/src/modules/conversion/orchestrator.ts`
- **What Happens:** The system runs hard programmatic checks before approving the output.
- **Details:** The quality gate asserts:
  1. The DIR document contains at least 1 section and more than 0 nodes.
  2. The Elementor document contains root containers and registered widgets.
  3. All image widgets have populated, non-empty image URLs.
  If any check fails, the job attempt is marked as failed and triggers retry logic.

---

### Step 29: Artifact Persistence and Job State Finalization
- **Handler File:** `server/src/modules/conversion/orchestrator.ts`
- **What Happens:** Conversion results are saved, and the job transitions to ready.
- **Details:** In PostgreSQL, the `ConversionJob` record is updated: `status = 'preview_ready'`, storing `dirArtifact`, `elementorArtifact`, and `previewArtifact`. The 30-second heartbeat timer is stopped, and the worker releases its concurrency slot for the next queued job.

---

### Step 30: Frontend Live Polling and Template Download
- **Handler Files:** `server/src/routes/jobs.ts` & `client/src/app/projects/[id]/page.tsx`
- **What Happens:** The user observes real-time progress on the dashboard and downloads the template.
- **Details:** The Next.js frontend polls `GET /api/v1/jobs/:id` every 2 seconds. When status reaches `preview_ready`, the UI renders the stage progress checkmarks, the interactive DIR tree inspector, and the Elementor raw JSON viewer. The user can click "Export Page JSON" to download the template for direct import into the Elementor Editor.

---

### Step 31: Optional Remote WordPress Publishing Trigger
- **Handler File:** `server/src/routes/sites.ts` (`publishRouter`)
- **What Happens:** The user chooses to publish the template directly to a remote WordPress site.
- **Details:** The client sends a `POST /api/v1/publish` request with `jobId`, `siteConnectionId`, `title`, and `confirmPublish: true`. The endpoint uses `getAuthenticatedUserId(req)` to verify user ownership and checks that the job has a compiled `elementorArtifact`.

---

### Step 32: Site Credential Decryption
- **Handler File:** `server/src/modules/security/encryption.ts` (`decrypt`)
- **What Happens:** The stored WordPress credentials are decrypted.
- **Details:** The application retrieves the `SiteConnection` record from the database. The encrypted WordPress username and Application Password are decrypted using AES-256-GCM via the server's `SITE_CREDENTIAL_ENCRYPTION_KEY`.

---

### Step 33: MCP Client Handshake and Tool Discovery
- **Handler File:** `server/src/modules/mcp/client.ts` (`MCPClient`)
- **What Happens:** The backend connects to the remote WordPress site over the Model Context Protocol (MCP).
- **Details:** The client initiates a JSON-RPC handshake against the WordPress site's MCP bridge endpoint (`elementor-mcp-bridge.php`). It calls `tools/list` to discover which publishing tools are supported on the target WordPress installation.

---

### Step 34: Two-Phase Publishing Execution
- **Handler File:** `server/src/modules/mcp/publisher.ts` (`MCPPublisher.publish`)
- **What Happens:** The Elementor layout is remotely injected into WordPress.
- **Details:**
  - **Direct Path:** If the `elementor_create_page` tool is available, the page is created and the Elementor container JSON is attached in a single atomic call.
  - **Fallback Path:** If only core tools are available, it calls `wp_create_post` (creating a draft page), followed by `elementor_set_post_data` to write `_elementor_data`, `_elementor_edit_mode = 'builder'`, and `_elementor_template_type = 'wp-page'`. If attaching metadata fails, it deletes the draft post to prevent orphan pages.

---

### Step 35: Read-Back Verification and Live Job Completion
- **Handler File:** `server/src/modules/mcp/publisher.ts`
- **What Happens:** The backend verifies that WordPress successfully stored the layout.
- **Details:** The client calls `elementor_get_post_data` or `wp_get_post` on the WordPress site. It counts the returned containers to confirm they match the compiled template. Once confirmed, the job status is updated to `published`, storing the live page URL and post ID in the database.

