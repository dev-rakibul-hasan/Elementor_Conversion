# Canonical API Contracts Specification (v1)

> **Lead Architect:** Mubasshir (Backend API & Architecture Lead)  
> **API Version:** `v1`  
> **Contract Status:** Finalized & Locked  
> **Target Services:** Server REST API, Frontend Client, Pipeline Worker

---

## 1. Overview & Protocol Guarantees

All endpoints communicate using standard JSON payloads over HTTP/HTTPS. Every API response follows a deterministic envelope structure ensuring strict contract fidelity between backend and frontend modules.

### 1.1 Success Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "apiVersion": "v1",
    "timestamp": "2026-10-20T11:42:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### 1.2 Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "DIR_VALIDATION_FAILED",
    "message": "DIR schema validation failed: assets[asset_1].sourceRect overflows bounds",
    "stage": "dir_validation",
    "field": "assets[asset_1].sourceRect",
    "details": [ ... ],
    "retryable": false,
    "timestamp": "2026-10-20T11:42:00.000Z",
    "requestId": "req_abc123"
  }
}
```

---

## 2. Standard Error Codes

| Code | HTTP Status | Meaning | Retryable? |
|---|---|---|---|
| `BAD_REQUEST` | 400 | Malformed request body or missing parameters | No |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token | No |
| `FORBIDDEN` | 403 | Insufficient permissions for project/job | No |
| `NOT_FOUND` | 404 | Conversion job or asset not found | No |
| `CONFLICT` | 409 | Idempotency collision or concurrent lock active | Yes |
| `VALIDATION_FAILED` | 422 | General schema validation failure | No |
| `DIR_VALIDATION_FAILED` | 422 | DIR Document violated canonical schema v1.0.0 | No |
| `DIR_REPAIR_FAILED` | 422 | Automated self-repair gate exhausted without passing | No |
| `ELEMENTOR_VALIDATION_FAILED` | 422 | Elementor template violated structural rules | No |
| `ELEMENTOR_HEALING_FAILED` | 422 | Stage D self-healing gate exhausted | No |
| `STAGE_TIMEOUT` | 504 | Individual pipeline stage exceeded configured timeout | Yes |
| `STAGE_FAILED` | 500 | Pipeline stage encountered execution error | Yes |
| `RETRY_LIMIT_EXCEEDED` | 500 | Stage exceeded maximum bounded retry attempts | No |
| `JOB_CANCELLED` | 499 | Conversion job was gracefully aborted by user/system | No |
| `INTERNAL_ERROR` | 500 | Unexpected server error | No |

---

## 3. Endpoints

### 3.1 Create Conversion Job
`POST /api/v1/jobs`

Initiates an asynchronous 7-stage conversion pipeline execution.

**Headers:**
- `Idempotency-Key` *(optional)*: Unique UUID to ensure idempotent execution.

**Request Body:**
```json
{
  "projectId": "proj_99f1a2",
  "sourceAssetId": "asset_hero_img",
  "mode": "fidelity",
  "idempotencyKey": "idem_req_uuid_123",
  "options": {
    "bypassCache": false,
    "targetElementorVersion": "4.3.5",
    "containerMaxWidth": 1200,
    "enableSelfHealing": true,
    "maxSelfHealingAttempts": 2,
    "preferredThemeBackground": "#050a04"
  }
}
```

**Response `201 Created` (or `200 OK` on Idempotent Replay):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "projectId": "proj_99f1a2",
    "status": "validating_upload",
    "currentStage": "upload_validation",
    "progressPercent": 5,
    "idempotencyKey": "idem_req_uuid_123",
    "isIdempotentReplay": false,
    "createdAt": "2026-10-20T11:42:00.000Z"
  }
}
```

---

### 3.2 Poll Job Status & Stages Timeline
`GET /api/v1/jobs/:id`

Retrieves real-time status and granular stage progression for Safaet's frontend pipeline tracker.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "projectId": "proj_99f1a2",
    "status": "generating_elementor",
    "currentStage": "elementor_generation",
    "progressPercent": 65,
    "attempts": 1,
    "maxAttempts": 3,
    "createdAt": "2026-10-20T11:42:00.000Z",
    "updatedAt": "2026-10-20T11:42:35.000Z",
    "completedAt": null,
    "stages": {
      "upload_validation": {
        "stage": "upload_validation",
        "status": "completed",
        "attempt": 1,
        "maxAttempts": 2,
        "startedAt": "2026-10-20T11:42:01.000Z",
        "completedAt": "2026-10-20T11:42:02.000Z",
        "durationMs": 1050,
        "progressPercent": 100,
        "message": "Magic bytes verified and SHA-256 deduplicated"
      },
      "image_analysis": {
        "stage": "image_analysis",
        "status": "completed",
        "attempt": 1,
        "maxAttempts": 3,
        "startedAt": "2026-10-20T11:42:02.000Z",
        "completedAt": "2026-10-20T11:42:15.000Z",
        "durationMs": 13000,
        "progressPercent": 100,
        "message": "Dark theme canvas #050a04 detected"
      },
      "dir_generation": {
        "stage": "dir_generation",
        "status": "completed",
        "attempt": 1,
        "maxAttempts": 3,
        "startedAt": "2026-10-20T11:42:15.000Z",
        "completedAt": "2026-10-20T11:42:28.000Z",
        "durationMs": 13000,
        "progressPercent": 100
      },
      "dir_validation": {
        "stage": "dir_validation",
        "status": "completed",
        "attempt": 1,
        "maxAttempts": 3,
        "startedAt": "2026-10-20T11:42:28.000Z",
        "completedAt": "2026-10-20T11:42:30.000Z",
        "durationMs": 2000,
        "progressPercent": 100,
        "message": "Canonical DIR schema v1.0.0 validated"
      },
      "elementor_generation": {
        "stage": "elementor_generation",
        "status": "processing",
        "attempt": 1,
        "maxAttempts": 3,
        "startedAt": "2026-10-20T11:42:30.000Z",
        "progressPercent": 50
      },
      "elementor_validation": {
        "stage": "elementor_validation",
        "status": "pending",
        "attempt": 0,
        "maxAttempts": 3,
        "progressPercent": 0
      },
      "preview_rendering": {
        "stage": "preview_rendering",
        "status": "pending",
        "attempt": 0,
        "maxAttempts": 3,
        "progressPercent": 0
      }
    },
    "artifacts": {
      "hasDir": true,
      "hasElementor": false,
      "hasPreview": false
    }
  }
}
```

---

### 3.3 Get Canonical DIR Artifact
`GET /api/v1/jobs/:id/dir`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "ready": true,
    "schemaVersion": "1.0.0",
    "data": {
      "version": "1.0.0",
      "meta": { ... },
      "breakpoints": { ... },
      "globals": { ... },
      "assets": [ ... ],
      "pages": [ ... ]
    },
    "validationSummary": {
      "valid": true,
      "errorCount": 0,
      "warningCount": 0
    }
  }
}
```

---

### 3.4 Get Native Elementor JSON Artifact
`GET /api/v1/jobs/:id/elementor`

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "ready": true,
    "targetVersion": "4.3.5",
    "data": {
      "version": "0.4",
      "title": "Marketing Landing",
      "type": "page",
      "page_settings": {
        "template": "elementor_canvas",
        "background_background": "classic",
        "background_color": "#050a04"
      },
      "content": [ ... ]
    },
    "assetManifest": {
      "assets": [
        {
          "assetId": "asset_hero",
          "type": "image",
          "role": "hero artwork",
          "sourceRect": { "x": 120, "y": 80, "width": 480, "height": 360 },
          "storagePath": "projects/proj_99f1a2/assets/hero.png",
          "status": "stored"
        }
      ],
      "unresolvedAssetIds": ["asset_hero"]
    },
    "stats": {
      "totalSections": 2,
      "totalContainers": 4,
      "totalWidgets": 7,
      "widgetSlugs": ["heading", "button", "image", "icon-list"]
    }
  }
}
```

---

### 3.5 Stage-Level Resumption & Retry
`POST /api/v1/jobs/:id/retry`

Resumes a failed job directly from the checkpoint of the failed stage without repeating costly earlier stages (such as Vision AI).

**Request Body:**
```json
{
  "resumeFromStage": "elementor_generation",
  "forceFresh": false,
  "reason": "Retrying after transient timeout"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "status": "generating_elementor",
    "resumedFromStage": "elementor_generation",
    "attempt": 2,
    "maxAttempts": 3,
    "message": "Job resumed from stage checkpoint"
  }
}
```

---

### 3.6 Job Cancellation
`POST /api/v1/jobs/:id/cancel`

Gracefully aborts a currently executing job.

**Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_c1082e",
    "status": "cancelled",
    "cancelledAt": "2026-10-20T11:43:00.000Z",
    "message": "Conversion job cancelled successfully"
  }
}
```
