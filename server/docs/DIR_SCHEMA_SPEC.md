# Design Intermediate Representation (DIR) Specification

> **Authoritative Version:** `1.0.0`  
> **Schema Definition:** `server/src/modules/dir/types.ts` & `server/src/modules/dir/schema.ts`  
> **Architecture Owner:** Mubasshir (Backend API & Architecture Lead)

---

## 1. Architectural Role & Invariants

The **Design Intermediate Representation (DIR)** serves as the canonical boundary between visual perception (Stage A/B) and Elementor AST generation (Stage C/D).

```
┌─────────────────────────────────┐
│     Uploaded Webpage Image      │
└────────────────┬────────────────┘
                 │
                 ▼  Stage A: Image-to-DIR (Vision Extraction)
┌─────────────────────────────────┐
│       Canonical DIR Document    │  <-- Version 1.0.0 validated via Zod schema
│   (Semantic Layout, Style, Meta)│
└────────────────┬────────────────┘
                 │
                 ▼  Asset Extraction Pipeline (sharp crop based on sourceRect)
┌─────────────────────────────────┐
│  Cropped Local/B2 Media Assets  │
└────────────────┬────────────────┘
                 │
                 ▼  Stage C: DIR-to-Elementor (Layout Engine Compiler)
┌─────────────────────────────────┐
│ Native Elementor Template JSON  │  <-- Built from verified 32 widget profiles
│ (Canvas Page Settings + Content)│
└─────────────────────────────────┘
```

### Immutable Architectural Constraints:
1. **Never Bypass DIR:** Direct one-shot image-to-Elementor prompts are strictly prohibited.
2. **Strict Numeric Style Types:** Dimensions, font sizes, line heights, borderWidth, and padding/margin must be bare numbers (e.g., `24`), NEVER strings like `"24px"`.
3. **No Legacy Section/Column in Layouts:** Tree structures map to modern Flexbox Containers (`elType: "container"`).
4. **Hierarchy Rules:** All sections belong strictly inside `pages[0].sections`, never floating at root level.
5. **Asset Bounding Box Integrity:** Asset `sourceRect` coordinates must strictly fall within `sourceWidth` and `sourceHeight` (`x >= 0, y >= 0, x + width <= sourceWidth, y + height <= sourceHeight`).

---

## 2. Root Document Envelope (`DIRDocument`)

```typescript
export interface DIRDocument {
  version: '1.0.0';
  meta: DIRMeta;
  breakpoints: DIRBreakpoints;
  globals: DIRGlobals;
  assets: DIRAsset[];
  pages: DIRPage[];
  canvas_bounds?: DIRCanvasBounds;
}
```

### 2.1 Metadata (`DIRMeta`)
Records the provenance of the visual analysis:
```typescript
export interface DIRMeta {
  sourceImageHash: string;      // SHA-256 of source image
  sourceWidth: number;          // Native image pixel width (e.g. 1440)
  sourceHeight: number;         // Native image pixel height (e.g. 900)
  analysisProvider: string;      // e.g. "gemini"
  analysisModel: string;         // e.g. "gemini-3.8-flash"
  analysisTimestamp: string;     // ISO 8601
  confidenceScore: number;       // 0.0 to 1.0
  schemaVersion: '1.0.0';
  promptVersion: string;         // e.g. "2.0.0"
  elementorVersion?: string;     // Target Elementor Core version (e.g. "4.3.5")
  notes?: string[];
}
```

### 2.2 Global Design Tokens (`DIRGlobals`)
Defines the foundational colors, typography scale, and spacing tokens:
```typescript
export interface DIRGlobals {
  colors: {
    background: string;          // Mandatory canvas background (e.g. "#050a04")
    text: string;                // Mandatory primary text color (e.g. "#ffffff")
    primary?: string;            // e.g. "#b7f34c"
    secondary?: string;          // e.g. "#a1a1aa"
    accent?: string;
    surface?: string;
    border?: string;
  };
  typography: {
    fontFamilies: string[];      // e.g. ["Inter", "sans-serif"]
    headingFont?: string;
    bodyFont?: string;
    baseSize?: number;           // Defaults to 16
    scale?: number;              // Defaults to 1.25
  };
  spacing?: {
    unit: 'px' | 'rem';
    base: number;                // Defaults to 8
    sectionGap?: number;         // Defaults to 48
    containerMaxWidth?: number;  // Defaults to 1200
  };
}
```

### 2.3 Assets & Crop Manifest (`DIRAsset`)
Defines sub-regions (3D artwork, logos, icons, photos) to be cropped from the source image buffer using `sharp`:
```typescript
export interface DIRAsset {
  id: string;                    // e.g. "asset_hero_flower"
  type: 'image' | 'icon' | 'logo' | 'background' | 'video' | 'placeholder';
  role: string;                  // e.g. "hero graphic artwork"
  sourceRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  description?: string;
  placeholder?: string;          // Populated after crop pipeline
  url?: string;
  confidence: number;
}
```

---

## 3. Section Roles & Canonical Partitioning

Every page contains an array of sections (`DIRSection[]`). Each section specifies a canonical role:

| Section Role | Typical Meaning | Header/Hero Rule |
|---|---|---|
| `header` | Site top navigation | Partitioned into 3 slots: logo, inline menu links, actions CTA |
| `hero` | Primary landing headline & CTA | Inherits dark background; contains H1, CTA, and hero artwork asset |
| `feature` | Features grid or cards | Reflows from horizontal row to column on tablet/mobile |
| `stats` | Metric counters | 1:1 Aspect ratio circular badge or counter widgets |
| `pricing` | Pricing tier cards | Border, radius, elevation with CTA button |
| `testimonial`| Reviews or quote carousel | Text editor, rating, avatar image |
| `cta` | Conversion banner | High-contrast button, background gradient or color |
| `footer` | Bottom links & copyright | Multi-column footer links and legal text |

---

## 4. Node Kinds & Supported Widgets

Nodes map deterministically to Elementor Core 4.3.5 built-in widgets:

- **Layout:** `container`, `flex-group`, `grid-group` -> Modern Flexbox Container (`elType: "container"`)
- **Text:** `heading` -> `heading` widget (H1–H6, direct font sizes and hex colors)
- **Editor:** `text` -> `text-editor` widget
- **CTA:** `button` -> `button` widget (high contrast, border radius, padding)
- **Media:** `image` -> `image` widget (`url`, `id`, `alt_text`)
- **Icons & Menus:** `icon`, `icon-text`, `link`, `list` -> `icon-list` (`view: "inline"`) or `icon-box`
- **Metrics:** `counter` -> `counter` widget (`starting_number`, `ending_number`, `suffix`)
- **Badges:** `badge` -> Pill flex container (`border_radius: 9999px`) + contrast text

---

## 5. Backward Compatibility & Normalization

The adapter in `server/src/modules/dir/compatibility.ts` guarantees backward compatibility:
- Upgrades unversioned or legacy `0.x` representations to canonical `1.0.0`.
- Auto-coerces CSS strings (`"24px"` -> `24`).
- Wraps bare AI section lists into canonical `pages[0].sections`.
- Provides defaults for missing metadata and design tokens.

