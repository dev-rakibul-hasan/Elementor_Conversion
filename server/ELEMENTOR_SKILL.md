# Master Skill Specification: High-Fidelity Design-to-Elementor Pipeline

> **Skill Set:** Elementor Image-to-Template Skill Set  
> **Version:** 2.0.0  
> **Source Snapshot:** Elementor Core 4.3.5 verified widget registrations  
> **Repository Architecture:** Two-Stage Pipeline (Image-to-DIR -> DIR-to-Elementor)

This authoritative skill specification governs the complete image-to-Elementor conversion pipeline. It defines the explicit separation of responsibilities between **Stage A (Vision Understanding to Canonical DIR)** and **Stage B (DIR to Elementor Compilation & Widget Selection)**, and provides native Elementor JSON node profiles for all 32 classic built-in widgets in Elementor Core 4.3.5.

---

## 1. Architectural Separation: The Two Reasoning Responsibilities

The pipeline strictly isolates visual interpretation from WordPress/Elementor JSON generation. An AI model must never attempt to jump directly from a raw screenshot to Elementor JSON in a single step without canonical intermediate representation.

```
┌─────────────────────────────────┐
│     Uploaded Webpage Image      │
└────────────────┬────────────────┘
                 │
                 ▼  Stage A: Image-to-DIR (Vision Extraction)
┌─────────────────────────────────┐
│       Canonical DIR Document    │  <-- Strictly validated via Zod schema
│   (Semantic Layout, Style, Meta)│
└────────────────┬────────────────┘
                 │
                 ▼  Asset Extraction Pipeline (sharp crop based on sourceRect)
┌─────────────────────────────────┐
│  Cropped Local/B2 Media Assets  │
└────────────────┬────────────────┘
                 │
                 ▼  Stage B: DIR-to-Elementor (Layout Engine Compiler)
┌─────────────────────────────────┐
│ Native Elementor Template JSON  │  <-- Built from verified 32 widget profiles
│ (Canvas Page Settings + Content)│
└─────────────────────────────────┘
```

### Stage A: Image-to-DIR Reasoning Responsibilities
The Vision model (e.g. Gemini 3.8 Flash or secondary vision provider) is exclusively responsible for visual perception, layout reconstruction, typography transcription, color extraction, and asset localization into the authoritative `DIRDocument` schema:

1. **Header & Navigation Bar Decomposition:**
   - **Canonical 3-Slot Partitioning:** Top header must be a dedicated section (`role: "header"`, `id: "sec_header"`, `direction: "row"`, `justifyContent: "space-between"`, `alignItems: "center"`) partitioned into 3 distinct functional slots:
     - **Slot 1 (Left - Brand Logo):** `image` or `heading` node with `label: "logo"`. Enforce pixel width (e.g. 120–220px, height 32–50px), never percentage.
     - **Slot 2 (Center - Navigation Menu Links):** Group all nav links together into a single horizontal container (`direction: "row"`, `gap: 28-36`, `label: "navigation-menu"`) composed of `link` nodes.
     - **Slot 3 (Right - Header Actions & CTAs):** Separate action buttons and auxiliary links (e.g. "Login", "Sign up", language switcher "EN") into a distinct horizontal container (`direction: "row"`, `gap: 16-20`, `justifyContent: "flex-end"`, `label: "header-actions"`).
2. **Hero Section Hierarchy:**
   - **Announcement Pill Badges:** Identify top-of-hero pill notifications (e.g., "A trusted modern fintech platform") as a `badge` node or a `container` with full pill border radius (`9999px`), light/lime accent background (`#b7f34c`), and high-contrast dark text (`#060b05`).
   - **Primary Headline:** Transcribe the primary page title (e.g., "Simplify your financial\nManagement") as an H1 `heading` with large font size (48–64px), matching alignment, and high-contrast color (`#ffffff` on dark themes).
   - **Supporting Subtitle/Body:** Transcribe subtitle copy as `text` nodes.
   - **Prominent 3D Artwork & Illustrations:** Do not ignore hero graphics (e.g., the glowing green 3D glass flower). Define an entry in the root `assets` array with `type: "image"`, `role: "hero graphic artwork"`, and exact pixel bounding box `sourceRect: { "x": <number>, "y": <number>, "width": <number>, "height": <number> }`. Reference it in the hero section via an `image` node with `assetId`.
3. **Canvas & Section Background Colors:**
   - Faithfully capture dark themes! If the page background is near-black (`#050a04`), set `globals.colors.background: "#050a04"` and the hero section `styles.backgroundColor: "#050a04"`. Never leave background transparent or undefined on dark themes.
4. **Distinction Between Observed Facts & Inferred Responsive Behavior:**
   - Directly observed layout facts (exact copy, colors, positions, asset bounding boxes) must be recorded faithfully.
   - When multi-viewport designs are provided or responsive adaptations are inferred, specify them using the optional `responsiveOverrides` object (`tablet` and `mobile` keys) on nodes or sections.
5. **Strict Numeric & Schema Constraints:**
   - All style dimensions, fontSize, gap, padding, margin, and borderWidth values must be bare numbers (e.g. `16`, `24`), NEVER strings like `"16px"`.
   - Asset `sourceRect` must be strictly bounded within the image dimensions (`x >= 0, y >= 0, x + width <= sourceWidth, y + height <= sourceHeight`).
   - No raw CSS properties in styles (e.g. do NOT use `marginBottom`, `marginTop`, `gridTemplateColumns` in styles).
   - Hierarchy rule: sections belong strictly inside `pages[0].sections`, never directly in `pages[]`.

### Stage B: DIR-to-Elementor Reasoning Responsibilities
The Elementor Layout Engine (deterministic compiler `convertDIRToElementor` and skill prompt) is exclusively responsible for compiling the validated `DIRDocument` into native Elementor Core 4.3.5 template JSON:

1. **Root Envelope & Canvas Background:**
   - Root page settings must inherit `dir.globals.colors.background` (e.g., `#050a04`) with `template: "elementor_canvas"` and `background_background: "classic"`.
   - Root section containers inherit `pageBg` whenever section background is unset or transparent, preventing default white browser rendering.
2. **Inline Navigation Menu & Actions Compilation:**
   - **Slot 1 (Logo):** Pixel width (`unit: "px"`), `align: "left"`, `align_self: "center"`, `_element_width: "initial"`, `_flex_shrink: 0`, `_flex_grow: 0`.
   - **Slot 2 (Menu):** Compiled into canonical Elementor Core `icon-list` widget with `view: "inline"`, `space_between: 32`, `align_self: "center"`, explicit width calculation (`width: { unit: "px", size: ... }`), `_element_width: "initial"`, `_flex_shrink: 0`, `_flex_grow: 0` so it NEVER wraps into multiple lines.
   - **Slot 3 (Actions Container):** Container with `flex_direction: "row"`, `flex_wrap: "nowrap"`, `flex_justify_content: "flex-end"`, `flex_align_items: "center"`, `flex_grow: 0`, `_flex_grow: 0`, `flex_shrink: 0`, `_flex_shrink: 0`, `content_width: "full"`, `_element_width: "initial"`. Each child button has `_element_width: "initial"`, `_flex_shrink: 0` so buttons stay neatly grouped on the right edge without spreading across the navbar.
3. **Pill Badge Container Generation:**
   - Compile `badge` nodes into a centered flex container with `border_radius: 9999px`, `background_background: "classic"`, `background_color: "#b7f34c"`, and inner span heading with contrasting dark text (`#060b05`).
4. **Sub-Asset Resolution & Media Linking:**
   - Prior to compilation, the asset extraction pipeline crops sub-regions from the source image buffer using `asset.sourceRect`, stores the cropped PNG in local/B2 storage (`projects/${job.projectId}/assets/...`), registers a database `Asset`, and assigns `asset.placeholder` and `node.url`.
   - `convertImageNode` resolves `node.url || asset.placeholder || asset.url` into `settings.image = { url, id }`.
5. **Widget Slugs & Control IDs:**
   - Slugs must match the Elementor Core 4.3.5 registry exactly: `heading`, `text-editor`, `button`, `image`, `icon`, `icon-box`, `icon-list`, `divider`, `spacer`, `counter`, `progress`, `star-rating`, `social-icons`, `video`, `google_maps`, `tabs`, `accordion`.
6. **Responsive Controls Application:**
   - Apply Elementor responsive suffix conventions (`_tablet` and `_mobile`) for container flex directions, grid columns, typography font sizes, and container padding/margin.
   - Enforce mobile viewport width clamping (`width_mobile: { unit: '%', size: 100 }`) on desktop containers > 360px.

---

## 2. Responsive Engineering & Control Matrix (Elementor 4.3.5)

Elementor 4.3.5 employs a deterministic suffix convention for device-specific overrides:
- **Desktop:** Unadorned control ID (e.g., `flex_direction`, `typography_font_size`, `padding`)
- **Tablet (<= 1024px):** `_tablet` suffix (e.g., `flex_direction_tablet`, `typography_font_size_tablet`, `padding_tablet`)
- **Mobile (<= 767px):** `_mobile` suffix (e.g., `flex_direction_mobile`, `typography_font_size_mobile`, `padding_mobile`)

### A. Container Reflow Rules
1. **Flexbox Row to Column:**
   Containers with desktop `flex_direction: "row"` that contain multi-element hero content, feature columns, or card groups automatically receive:
   ```json
   "flex_direction_tablet": "column",
   "flex_direction_mobile": "column"
   ```
2. **CSS Grid Reflow:**
   Grid containers with 3 or more columns on desktop reflow down:
   ```json
   "grid_columns_grid": { "unit": "fr", "size": 3 },
   "grid_columns_grid_tablet": { "unit": "fr", "size": 2 },
   "grid_columns_grid_mobile": { "unit": "fr", "size": 1 }
   ```

### B. Typography Scaling Matrix
Hero headlines and large display titles must scale proportionally across breakpoints to prevent clipping and horizontal scrolling:
| Desktop Size | Tablet Size (`_tablet`) | Mobile Size (`_mobile`) |
|:---|:---|:---|
| >= 48px | `Math.round(desktop * 0.72)` (min 32px) | `Math.round(desktop * 0.52)` (min 26px) |
| 32px – 47px | `Math.round(desktop * 0.82)` | `Math.round(desktop * 0.68)` |
| < 32px | Unchanged | `Math.max(14, Math.round(desktop * 0.85))` |

### C. Viewport Clamping & Spacing Adaptation
1. **Fixed Width Clamping:** Containers or images with fixed desktop width > 360px receive:
   ```json
   "width_mobile": { "unit": "%", "size": 100 }
   ```
2. **Spacing Scaling:** Section and container padding scales down to avoid edge pinching:
   - Tablet: 0.75x desktop padding
   - Mobile: 0.50x desktop padding (clamped with minimum 16px horizontal)

### D. Prompt Version & Cache Identity
All pipeline prompt payloads specify an explicit version string for deterministic cache management:
- `PROMPT_VERSIONS.IMAGE_ANALYSIS`: `v1.6.0`
- `PROMPT_VERSIONS.ELEMENTOR_CONVERSION`: `v1.2.0`
- `PROMPT_VERSIONS.DIR_REPAIR`: `v1.1.0`
- `PROMPT_VERSIONS.SECTION_REPAIR`: `v1.0.0`

Any alteration to skill prompts, widget profiles, or responsive mappings immediately invalidates prior cached AI inferences.

---

## 3. Typography Engineering, Font Canonicalization & Color Binding Matrix

Elementor Core relies on strict, widget-specific control keys to apply typography and color overrides. If typography properties are not bound to the exact control keys or if font families are specified with invalid generic names, Elementor will silently ignore the styling and fall back to the host WordPress theme defaults (often Times New Roman or Arial).

### A. The Universal Cascading Inheritance Hierarchy
Typography and text colors resolve according to a deterministic 5-level cascade:
```
Level 1: Explicit Node Inline Styles (`node.styles.fontFamily`, `node.styles.fontSize`, `node.styles.color`)
   │
   ▼ (if unset)
Level 2: Node Typography Perception Object (`node.typography.font_family_guess`, `node.typography.color_hex`)
   │
   ▼ (if unset)
Level 3: Global Document Typography (`dir.globals.typography.headingFont` for headings, `bodyFont` for text/buttons)
   │
   ▼ (if unset)
Level 4: Global Document Font List (`dir.globals.typography.fontFamilies[0]`)
   │
   ▼ (if unset)
Level 5: Canonical Modern Fallback (`"Plus Jakarta Sans"` for headings/display, `"Inter"` for body/buttons/links)
```

### B. Google Fonts Canonicalization
Elementor natively connects to the Google Fonts library. Vision AI models often output loose names (e.g. `"Modern Sans"`, `"sans-serif"`, `"display"`, or quoted strings). The compiler maps these to canonical Google Fonts:

| Input String / AI Guess | Canonical Elementor Google Font |
|:---|:---|
| `*jakarta*` | `"Plus Jakarta Sans"` |
| `*inter*`, `*sans*`, `*sans-serif*`, `*clean*` | `"Inter"` |
| `*poppins*` | `"Poppins"` |
| `*montserrat*` | `"Montserrat"` |
| `*roboto*` | `"Roboto"` |
| `*outfit*` | `"Outfit"` |
| `*serif*`, `*playfair*` | `"Playfair Display"` |
| `*merriweather*` | `"Merriweather"` |
| `*dm sans*`, `*dmsans*` | `"DM Sans"` |
| `*lato*` | `"Lato"` |
| `*open sans*` | `"Open Sans"` |
| `*raleway*` | `"Raleway"` |
| `*work sans*` | `"Work Sans"` |
| `*space gro*` | `"Space Grotesk"` |
| `*syne*` | `"Syne"` |
| `*clash*` | `"Clash Display"` |
| `*satoshi*` | `"Satoshi"` |
| `*manrope*` | `"Manrope"` |
| `*urbanist*` | `"Urbanist"` |
| `*mono*` | `"Roboto Mono"` |

### C. Widget-Specific Color & Typography Control Key Matrix
Different Elementor widgets use different control IDs for text color and typography:

| Widget Slug (`widgetType`) | Text Color Control Key | Typography Group Activation | Font Family Key | Font Size Key |
|:---|:---|:---|:---|:---|
| `heading` | `title_color` | `typography_typography: "custom"` | `typography_font_family` | `typography_font_size` |
| `text-editor` | `text_color` | `typography_typography: "custom"` | `typography_font_family` | `typography_font_size` |
| `button` / `link` | `button_text_color` | `typography_typography: "custom"` | `typography_font_family` | `typography_font_size` |
| `icon-list` (Nav Menu) | `text_color` | `typography_typography: "custom"` | `typography_font_family` | `typography_font_size` |
| `counter` | `number_color` & `title_color` | `typography_number_typography: "custom"` | `typography_number_font_family` | `typography_number_font_size` |
| `icon-box` | `title_color` | `title_typography_typography: "custom"` | `title_typography_font_family` | `title_typography_font_size` |

> [!IMPORTANT]
> `typography_typography: "custom"` must ALWAYS be emitted whenever any typography property (`font_family`, `font_size`, `font_weight`, `line_height`, `letter_spacing`, `text_transform`) is specified. Without this flag, Elementor's CSS generator ignores the individual sub-keys.

### D. Background Luminance & High-Contrast Safety
When text color is omitted by Vision AI:
1. The compiler evaluates the effective background color (from `node.styles.backgroundColor` or `dir.globals.colors.background`).
2. If `isDarkColor(effectiveBg)` is `true` (relative luminance < 0.5):
   - Headings default to `#FFFFFF`.
   - Body text defaults to `#E2E8F0` or `#94A3B8`.
   - Action buttons default to `#FFFFFF` (or `#060B05` if the button background is a bright lime/yellow accent `#B7F34C`).
3. If `isDarkColor(effectiveBg)` is `false` (light background):
   - Text falls back to `dir.globals.colors.text` or `#182135`.

### E. Background Gradient Engineering
Elementor Core natively supports linear and radial gradients on containers, canvas page settings, and buttons:
```json
{
  "background_background": "gradient",
  "background_color": "#1b2248",
  "background_color_b": "#141b3c",
  "background_gradient_type": "linear",
  "background_gradient_angle": { "unit": "deg", "size": 180 },
  "background_color_stop": { "unit": "%", "size": 0 },
  "background_color_b_stop": { "unit": "%", "size": 100 }
}
```
Whenever `canvas_bounds.inner_bg_type === 'gradient'` or `section.styles.backgroundGradient` is specified, the compiler emits native Elementor gradient settings instead of flattening to solid `classic`.

### F. Chromatic Fidelity & Element Styling Rules
1. **No Tailwind / Preset Snapping:** Vision models must never round subtle tones (e.g. pastel peach/apricot/caramel `#e7c69f` / `#deb285`) to highlighter yellow (`#fde047` / `#facc15`).
2. **Button Rounding & Padding:** Modern buttons default to `8px` rounded corners (or `50px` pill for hero search/CTA buttons). Buttons are never left with sharp `0px` rectangular corners.
3. **Muted Nav Links:** Navigation links on dark headers use soft slate/grey (`#cbd5e1` / `#94a3b8`) instead of harsh pure `#ffffff`.

---

## 4. Source and Compatibility Specifications

- **Source Archive:** `elementor.zip`; source version: **Elementor Core 4.3.5**.
- **Per-Widget Profiles:** Located at `server/src/skills/elementor/widgets/*.json`.
- **Layout Element Profiles:** Located at `server/src/skills/elementor/layout-elements/*.json`.
- **Widget Registry:** Located at `server/src/skills/elementor/widget-registry.json` (32 verified classic widgets).
- **Responsive Matrix:** Located at `server/src/skills/elementor/responsive-capabilities.json`.
- **Slug Exactness:** `widgetType` must match the registered widget slug exactly (e.g., Google Maps slug is `google_maps`, star rating is `star-rating`).
- **Control IDs:** Setting keys are the internal PHP control IDs, not display labels. Repeater rows (`tabs`, `icon_list`, `social_icon_list`), icons, and media objects have strictly structured shapes.

---

## 5. Native Elementor Content-Node Structure

### Container with child widgets

```json
{
  "id": "c0000001",
  "elType": "container",
  "settings": {
    "content_width": "full",
    "flex_direction": "column"
  },
  "elements": [
    {
      "id": "h0000001",
      "elType": "widget",
      "widgetType": "heading",
      "settings": {
        "title": "Build something great",
        "header_size": "h1",
        "align": "start"
      },
      "elements": []
    },
    {
      "id": "t0000001",
      "elType": "widget",
      "widgetType": "text-editor",
      "settings": {
        "editor": "<p>Describe the value of your service here.</p>"
      },
      "elements": []
    },
    {
      "id": "b0000001",
      "elType": "widget",
      "widgetType": "button",
      "settings": {
        "text": "Get Started",
        "link": {
          "url": "https://example.com/",
          "is_external": "",
          "nofollow": ""
        },
        "size": "sm",
        "align": "start"
      },
      "elements": []
    }
  ],
  "isInner": false
}
```

A normal classic widget node has `elType: "widget"`, its exact `widgetType`, a `settings` object, and normally an `elements` array. A Container uses `elType: "container"` and contains its children under `elements`. The `id` must be unique within the document. `settings` holds Elementor control values, not generic HTML attributes.

### Export wrapper note

The content tree above is not guaranteed to be the entire Template Library export envelope. The exact outer wrapper differs by import/export route. Generate or validate the final template using the target Elementor export path; do not wrap the content tree in an invented envelope.

## 4. Widget JSON examples

The following minimal nodes demonstrate source-defined content controls for each classic built-in widget registered in this source snapshot. Styling examples are intentionally limited; use the source schema for any extra style controls, responsive values, shared group controls, globals, and dynamic tags.

### Legacy Inner Section — `section` / `column`

This is a structural legacy layout element, not an ordinary widget node. Prefer Containers for newly reconstructed pages. Keep this only when replicating a legacy Section/Column layout.

```json
{
  "id": "s0000001",
  "elType": "section",
  "settings": {
    "content_width": "boxed"
  },
  "elements": [
    {
      "id": "k0000001",
      "elType": "column",
      "settings": {
        "_column_size": 50
      },
      "elements": [
        {
          "id": "h0000002",
          "elType": "widget",
          "widgetType": "heading",
          "settings": {
            "title": "Left column",
            "header_size": "h2"
          },
          "elements": []
        }
      ],
      "isInner": true
    },
    {
      "id": "k0000002",
      "elType": "column",
      "settings": {
        "_column_size": 50
      },
      "elements": [
        {
          "id": "t0000002",
          "elType": "widget",
          "widgetType": "text-editor",
          "settings": {
            "editor": "<p>Right column content.</p>"
          },
          "elements": []
        }
      ],
      "isInner": true
    }
  ],
  "isInner": true
}
```

### Heading — `heading`

Source: `includes/widgets/heading.php`

```json
{
  "id": "w0000001",
  "elType": "widget",
  "widgetType": "heading",
  "settings": {
    "title": "A clear page headline",
    "header_size": "h1",
    "align": "center",
    "title_color": "#172033"
  },
  "elements": []
}
```

### Image — `image`

Source: `includes/widgets/image.php`

```json
{
  "id": "w0000002",
  "elType": "widget",
  "widgetType": "image",
  "settings": {
    "image": {
      "id": 101,
      "url": "https://example.com/hero-image.jpg"
    },
    "image_size": "full",
    "align": "center",
    "caption_source": "none",
    "link_to": "none"
  },
  "elements": []
}
```

### Text Editor — `text-editor`

Source: `includes/widgets/text-editor.php`

```json
{
  "id": "w0000003",
  "elType": "widget",
  "widgetType": "text-editor",
  "settings": {
    "editor": "<p>Supporting paragraph text goes here.</p>",
    "align": "start",
    "text_color": "#333333"
  },
  "elements": []
}
```

### Video — `video`

Source: `includes/widgets/video.php`

```json
{
  "id": "w0000004",
  "elType": "widget",
  "widgetType": "video",
  "settings": {
    "video_type": "youtube",
    "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "aspect_ratio": "169",
    "controls": "yes"
  },
  "elements": []
}
```

### Button — `button`

Source: `includes/widgets/button.php + includes/widgets/traits/button-trait.php`

```json
{
  "id": "w0000005",
  "elType": "widget",
  "widgetType": "button",
  "settings": {
    "button_type": "",
    "text": "Learn More",
    "link": {
      "url": "https://example.com/learn-more",
      "is_external": "",
      "nofollow": ""
    },
    "size": "sm",
    "icon_align": "row",
    "align": "center"
  },
  "elements": []
}
```

### Divider — `divider`

Source: `includes/widgets/divider.php`

```json
{
  "id": "w0000006",
  "elType": "widget",
  "widgetType": "divider",
  "settings": {
    "style": "solid",
    "width": {
      "unit": "%",
      "size": 60
    },
    "align": "center",
    "weight": {
      "unit": "px",
      "size": 2
    },
    "color": "#D9DEE7"
  },
  "elements": []
}
```

### Spacer — `spacer`

Source: `includes/widgets/spacer.php`

```json
{
  "id": "w0000007",
  "elType": "widget",
  "widgetType": "spacer",
  "settings": {
    "space": {
      "unit": "px",
      "size": 48
    }
  },
  "elements": []
}
```

### Image Box — `image-box`

Source: `includes/widgets/image-box.php`

```json
{
  "id": "w0000008",
  "elType": "widget",
  "widgetType": "image-box",
  "settings": {
    "image": {
      "id": 102,
      "url": "https://example.com/card-image.jpg"
    },
    "title_text": "Feature title",
    "description_text": "Short descriptive copy for this feature.",
    "title_size": "h3",
    "position": "top",
    "link": {
      "url": "https://example.com/feature",
      "is_external": "",
      "nofollow": ""
    }
  },
  "elements": []
}
```

### Google Maps — `google_maps`

Source: `includes/widgets/google-maps.php`

```json
{
  "id": "w0000009",
  "elType": "widget",
  "widgetType": "google_maps",
  "settings": {
    "address": "Dhaka, Bangladesh",
    "zoom": {
      "size": 12
    },
    "height": {
      "unit": "px",
      "size": 320
    }
  },
  "elements": []
}
```

### Icon — `icon`

Source: `includes/widgets/icon.php`

```json
{
  "id": "w0000010",
  "elType": "widget",
  "widgetType": "icon",
  "settings": {
    "selected_icon": {
      "value": "fas fa-star",
      "library": "fa-solid"
    },
    "view": "stacked",
    "shape": "circle",
    "link": {
      "url": "https://example.com/",
      "is_external": "",
      "nofollow": ""
    }
  },
  "elements": []
}
```

### Icon Box — `icon-box`

Source: `includes/widgets/icon-box.php`

```json
{
  "id": "w0000011",
  "elType": "widget",
  "widgetType": "icon-box",
  "settings": {
    "selected_icon": {
      "value": "fas fa-check",
      "library": "fa-solid"
    },
    "view": "stacked",
    "shape": "circle",
    "title_text": "Trusted Quality",
    "description_text": "Explain the benefit in one or two lines.",
    "title_size": "h3",
    "position": "block-start",
    "link": {
      "url": "https://example.com/quality",
      "is_external": "",
      "nofollow": ""
    }
  },
  "elements": []
}
```

### Star Rating — `star-rating`

Source: `includes/widgets/star-rating.php`

```json
{
  "id": "w0000012",
  "elType": "widget",
  "widgetType": "star-rating",
  "settings": {
    "rating_scale": "5",
    "rating": 4.5,
    "star_style": "star_fontawesome",
    "title": "Customer rating",
    "align": "center"
  },
  "elements": []
}
```

### Image Carousel — `image-carousel`

Source: `includes/widgets/image-carousel.php`

```json
{
  "id": "w0000013",
  "elType": "widget",
  "widgetType": "image-carousel",
  "settings": {
    "carousel_name": "Project gallery",
    "carousel": [
      {
        "id": 101,
        "url": "https://example.com/gallery-1.jpg"
      },
      {
        "id": 102,
        "url": "https://example.com/gallery-2.jpg"
      }
    ],
    "thumbnail_size": "medium",
    "slides_to_show": "2",
    "infinite": "yes"
  },
  "elements": []
}
```

### Basic Gallery — `image-gallery`

Source: `includes/widgets/image-gallery.php`

```json
{
  "id": "w0000014",
  "elType": "widget",
  "widgetType": "image-gallery",
  "settings": {
    "wp_gallery": [
      {
        "id": 101,
        "url": "https://example.com/gallery-1.jpg"
      },
      {
        "id": 102,
        "url": "https://example.com/gallery-2.jpg"
      }
    ],
    "thumbnail_size": "medium",
    "gallery_columns": "2",
    "gallery_display_caption": "none",
    "gallery_link": "none",
    "open_lightbox": "no"
  },
  "elements": []
}
```

### Icon List — `icon-list`

Source: `includes/widgets/icon-list.php`

```json
{
  "id": "w0000015",
  "elType": "widget",
  "widgetType": "icon-list",
  "settings": {
    "view": "traditional",
    "icon_list": [
      {
        "_id": "a1b2c3d",
        "text": "Fast delivery",
        "selected_icon": {
          "value": "fas fa-check",
          "library": "fa-solid"
        },
        "link": {
          "url": "",
          "is_external": "",
          "nofollow": ""
        }
      },
      {
        "_id": "a1b2c3e",
        "text": "Secure checkout",
        "selected_icon": {
          "value": "fas fa-check",
          "library": "fa-solid"
        },
        "link": {
          "url": "",
          "is_external": "",
          "nofollow": ""
        }
      }
    ],
    "link_click": "full_width"
  },
  "elements": []
}
```

### Counter — `counter`

Source: `includes/widgets/counter.php`

```json
{
  "id": "w0000016",
  "elType": "widget",
  "widgetType": "counter",
  "settings": {
    "starting_number": 0,
    "ending_number": 250,
    "prefix": "",
    "suffix": "+",
    "duration": 2000,
    "title": "Completed projects",
    "title_tag": "div"
  },
  "elements": []
}
```

### Progress Bar — `progress`

Source: `includes/widgets/progress.php`

```json
{
  "id": "w0000017",
  "elType": "widget",
  "widgetType": "progress",
  "settings": {
    "title": "Project completion",
    "title_tag": "span",
    "title_display": "yes",
    "progress_type": "",
    "percent": {
      "size": 75,
      "unit": "%"
    },
    "display_percentage": "show",
    "inner_text": ""
  },
  "elements": []
}
```

### Testimonial — `testimonial`

Source: `includes/widgets/testimonial.php`

```json
{
  "id": "w0000018",
  "elType": "widget",
  "widgetType": "testimonial",
  "settings": {
    "testimonial_content": "The team delivered excellent work and communication.",
    "testimonial_image": {
      "id": 103,
      "url": "https://example.com/customer.jpg"
    },
    "testimonial_name": "Alex Morgan",
    "testimonial_job": "Customer",
    "image_size": "thumbnail",
    "testimonial_alignment": "center"
  },
  "elements": []
}
```

### Tabs — `tabs`

Source: `includes/widgets/tabs.php`

```json
{
  "id": "w0000019",
  "elType": "widget",
  "widgetType": "tabs",
  "settings": {
    "tabs": [
      {
        "_id": "tab00001",
        "tab_title": "Overview",
        "tab_content": "<p>Overview content.</p>"
      },
      {
        "_id": "tab00002",
        "tab_title": "Details",
        "tab_content": "<p>Details content.</p>"
      }
    ],
    "type": "horizontal",
    "tabs_align_horizontal": ""
  },
  "elements": []
}
```

### Accordion — `accordion`

Source: `includes/widgets/accordion.php`

```json
{
  "id": "w0000020",
  "elType": "widget",
  "widgetType": "accordion",
  "settings": {
    "tabs": [
      {
        "_id": "acc00001",
        "tab_title": "What is included?",
        "tab_content": "<p>Describe what is included.</p>"
      },
      {
        "_id": "acc00002",
        "tab_title": "How does it work?",
        "tab_content": "<p>Explain the process.</p>"
      }
    ],
    "title_html_tag": "div"
  },
  "elements": []
}
```

### Toggle — `toggle`

Source: `includes/widgets/toggle.php`

```json
{
  "id": "w0000021",
  "elType": "widget",
  "widgetType": "toggle",
  "settings": {
    "tabs": [
      {
        "_id": "tgl00001",
        "tab_title": "More information",
        "tab_content": "<p>Additional details here.</p>"
      }
    ],
    "title_html_tag": "div"
  },
  "elements": []
}
```

### Social Icons — `social-icons`

Source: `includes/widgets/social-icons.php`

```json
{
  "id": "w0000022",
  "elType": "widget",
  "widgetType": "social-icons",
  "settings": {
    "social_icon_list": [
      {
        "_id": "soc00001",
        "social_icon": {
          "value": "fab fa-facebook",
          "library": "fa-brands"
        },
        "link": {
          "url": "https://facebook.com/example",
          "is_external": "true",
          "nofollow": "true"
        }
      },
      {
        "_id": "soc00002",
        "social_icon": {
          "value": "fab fa-instagram",
          "library": "fa-brands"
        },
        "link": {
          "url": "https://instagram.com/example",
          "is_external": "true",
          "nofollow": "true"
        }
      }
    ],
    "shape": "circle",
    "align": "center",
    "icon_size": {
      "unit": "px",
      "size": 18
    }
  },
  "elements": []
}
```

### Alert — `alert`

Source: `includes/widgets/alert.php`

```json
{
  "id": "w0000023",
  "elType": "widget",
  "widgetType": "alert",
  "settings": {
    "alert_type": "info",
    "alert_title": "Important notice",
    "alert_description": "This is the message shown in the alert.",
    "show_dismiss": "show"
  },
  "elements": []
}
```

### SoundCloud / Audio — `audio`

Source: `includes/widgets/audio.php`

```json
{
  "id": "w0000024",
  "elType": "widget",
  "widgetType": "audio",
  "settings": {
    "link": {
      "url": "https://soundcloud.com/example/track",
      "is_external": "",
      "nofollow": ""
    },
    "visual": "no",
    "sc_auto_play": "",
    "sc_show_artwork": "yes"
  },
  "elements": []
}
```

### Shortcode — `shortcode`

Source: `includes/widgets/shortcode.php`

```json
{
  "id": "w0000025",
  "elType": "widget",
  "widgetType": "shortcode",
  "settings": {
    "shortcode": "[example_shortcode id=\"123\"]"
  },
  "elements": []
}
```

### HTML — `html`

Source: `includes/widgets/html.php`

```json
{
  "id": "w0000026",
  "elType": "widget",
  "widgetType": "html",
  "settings": {
    "html": "<div class=\"custom-block\">Custom embed</div>"
  },
  "elements": []
}
```

### Menu Anchor — `menu-anchor`

Source: `includes/widgets/menu-anchor.php`

```json
{
  "id": "w0000027",
  "elType": "widget",
  "widgetType": "menu-anchor",
  "settings": {
    "anchor": "pricing"
  },
  "elements": []
}
```

### Sidebar — `sidebar`

Source: `includes/widgets/sidebar.php`

```json
{
  "id": "w0000028",
  "elType": "widget",
  "widgetType": "sidebar",
  "settings": {
    "sidebar": "REPLACE_WITH_REGISTERED_WORDPRESS_SIDEBAR_ID"
  },
  "elements": []
}
```

### Read More — `read-more`

Source: `includes/widgets/read-more.php`

```json
{
  "id": "w0000029",
  "elType": "widget",
  "widgetType": "read-more",
  "settings": {
    "link_text": "Read more"
  },
  "elements": []
}
```

### Rating — `rating`

Source: `includes/widgets/rating.php`

```json
{
  "id": "w0000030",
  "elType": "widget",
  "widgetType": "rating",
  "settings": {
    "rating_scale": {
      "size": 5
    },
    "rating_value": 4.5,
    "rating_icon": {
      "value": "eicon-star",
      "library": "eicons"
    },
    "icon_alignment": "start"
  },
  "elements": []
}
```

## 5. Media, URL, icon, repeater, and style value rules

### Media controls

An image field is normally an object containing an attachment `id` and `url`, and may contain additional metadata from WordPress/Elementor. Do not replace it with a bare URL string. Import/export can rewrite media values; test that flow on the target site.

```json
{
  "image": {
    "id": 101,
    "url": "https://example.com/image.jpg"
  }
}
```

### URL controls

Preserve the URL control object shape and only set behavior flags supported by the control. Example:

```json
{
  "link": {
    "url": "https://example.com/target",
    "is_external": "",
    "nofollow": ""
  }
}
```

### Icon controls

Classic Icon controls are objects such as `{"value":"fas fa-check","library":"fa-solid"}`. Use the icon library identifier expected by the target Elementor version; do not guess the library from the visible pictogram alone.

### Repeaters

Classic Accordion, Tabs, and Toggle use `settings.tabs`, with row fields `tab_title` and `tab_content`. Icon List uses `settings.icon_list` with `text`, `selected_icon`, and `link`. Social Icons uses `settings.social_icon_list` with `social_icon`, `link`, and optional per-item colors. Elementor often uses `_id` within repeater rows; preserve/generate unique row IDs as expected by the target export conventions.

### Sliders and responsive settings

Slider values usually use objects such as `{"unit":"px","size":24}`; some sliders have no unit or use `%`. Responsive controls may also serialize device-specific siblings. Consult the widget control declaration and a real exported example before emitting uncommon values.

## 6. Image-to-Elementor widget selection rules

| Visual content in uploaded design | First choice | Alternative / caveat |
|---|---|---|
| Large title or short heading | `heading` | Set the correct HTML tag and alignment; do not use Text Editor for a single heading. |
| Paragraph or rich text | `text-editor` | Preserve inline emphasis and lists if visible. |
| CTA or nav action | `button` | Use actual link only when known; otherwise keep a safe placeholder or empty URL per product requirements. |
| Single photo or illustration | `image` | Preserve image crop/ratio; do not screenshot the entire design into this widget. |
| Image plus title and copy | `image-box` | Use separate widgets/Container if the design requires richer structure than this widget supports. |
| Icon plus title and copy | `icon-box` | `icon-list` is better for repeated short rows. |
| Repeated cards | Container + individual widgets | Use equal child widths/gaps and responsive wrapping. There is no generic Core card widget in this registry. |
| Horizontal/vertical line | `divider` | Use border styling on a Container when the line is part of a larger card/frame. |
| FAQ rows | `accordion` or `toggle` | Do not invent nested accordion data; classic repeater format is shown above. |
| Tabbed content | `tabs` | Test if the current target site prefers nested tabs and supports that widget. |
| Review with avatar/name | `testimonial` | For more complex review cards, compose individual widgets inside Containers. |
| Social icon row | `social-icons` | Use target-supported brand icon libraries and actual destinations. |
| Gallery/slider | `image-gallery` / `image-carousel` | Use valid WordPress media attachment IDs or verified importable image URLs. |
| Map | `google_maps` | Requires correct location and may require a Google Maps API key. |
| Custom markup/embed | `html` or `shortcode` | Use only when a native editable widget cannot faithfully represent the visible function. |

## 7. How the agent should build a page

1. **Image analysis:** estimate the page width, section boundaries, column count, gaps, alignment, dominant colors, font scale, image aspect ratios, and mobile collapse behavior. Distinguish evidence from guesswork.
2. **Section hierarchy:** build one Container per major region, then nested Containers for rows/cards/columns. Use widget nodes for actual editable content.
3. **Widget match:** choose the simplest native widget that reproduces the visible function. Consult its widget JSON reference before writing settings.
4. **Content extraction:** transcribe legible copy exactly. Do not invent text hidden or unreadable in the image; use a clearly marked placeholder only when necessary.
5. **Style mapping:** map visible typography, colors, borders, radii, shadows, and spacing to Elementor control IDs. Do not assume CSS property names map directly to setting keys.
6. **Media mapping:** use uploaded assets when available; if only a screenshot is provided, crop/reuse source regions only when appropriate, and prefer genuine individual assets if supplied. Register/import media rather than embedding fragile local filesystem paths.
7. **Responsive inference:** if only desktop is provided, create a reasonable responsive adaptation and label it as inferred. If mobile screenshots are available, treat them as evidence.
8. **Export/import validation:** serialize valid JSON; run JSON/schema checks; import through Elementor on the target site; confirm all images, links, icons, and widgets resolve.
9. **Visual comparison:** render a screenshot at the same viewport as the source; compare section geometry, text wrapping, media crop, and visual hierarchy; iterate until major discrepancies are addressed.

## 8. Template JSON versus plugin output

### Elementor template JSON

Use this when the requested deliverable is an editable Elementor template. Include a valid target-compatible export envelope generated by the intended template export/import route. The node examples here are the content tree shapes, not a substitute for checking that envelope.

### Installable WordPress plugin

Use this when the user explicitly requests a plugin. A plugin needs a valid plugin header, safe PHP bootstrap, declared dependencies, activation/deactivation behavior only when needed, and a tested way to import/register the generated template. Do not claim a PHP ZIP is installable before testing it on a clean WordPress installation with the required Elementor version.

## 9. Completion checklist

- [ ] The chosen widgets exist in the target site's actual widget registry.
- [ ] Every `widgetType` exactly matches the registered slug.
- [ ] All IDs are unique and all children are under the intended Container/Section node.
- [ ] Widget setting keys and value shapes are confirmed against the correct source/schema.
- [ ] Image/media fields and gallery rows can be imported and resolve to valid media.
- [ ] Repeater rows, icon objects, URL objects, slider values, and responsive values are structurally valid.
- [ ] No unsupported Pro/add-on widget is emitted as if it were Core.
- [ ] JSON parses and imports into the target Elementor installation without fatal errors or missing widgets.
- [ ] The page is visually compared with the reference image at matched viewport dimensions.
- [ ] Any inferred content or responsive behavior is disclosed to the user.

## 10. Files in this skill reference pack

- `server/src/skills/elementor/widgets/*.json`: One native node example and source path per Core classic widget in the Elementor Core 4.3.5 source registry (30 widget profiles).
- `server/src/skills/elementor/widget-registry.json`: Machine-readable registry cataloging all 32 Core elements and widgets.
- `server/src/skills/elementor/source-control-index.md`: Broader source index of widget control IDs, group controls, and native JSON serialization notes.
- `server/src/skills/elementor/source-version.json`: Source version verification metadata confirming Elementor Core 4.3.5.
- `server/src/skills/elementor/layout-elements/container.json`: Modern Container flexbox composition example.
- `server/src/skills/elementor/layout-elements/inner-section.json`: Legacy Section/Column layout example.
- `server/ELEMENTOR_SKILL.md`: Authoritative master two-stage skill specification and inline widget JSON reference.

**Scope:** The Core 4.3.5 archive does not include the source for every Elementor Pro or third-party widget. Pro features should be handled gracefully via native Core fallbacks (such as inline `icon-list` for header navigation) or explicitly flagged when requested. Never emit fabricated or unregistered widgets.

---

## 11. Reconciled Master Builder Standards (from SKILL1.md & SKILL_RULE(1).md)

Following reconciliation between the repository's authoritative two-stage architecture and the supplied Master Builder skill sets (`SKILL1.md` and `SKILL_RULE(1).md`), the following rules and standards are authoritatively integrated:

### 11.1 Container Geometry & Sizing Standards (Schema v0.4)
- **Boxed vs. Full Width:**
  - Boxed: `"content_width": "boxed"`, `"boxed_width": { "unit": "px", "size": <number>, "sizes": [] }` (defaults to `dir.globals.spacing.containerMaxWidth || 1200`).
  - Full Width: `"content_width": "full"`.
- **Custom Heights:**
  - Min Height: `"height": "min-height"`, `"custom_height": { "unit": "px" | "vh", "size": <number>, "sizes": [] }`.
- **Flexbox Spacing & Gap:**
  - Gap: `"flex_gap": { "unit": "px", "size": <number> }` or `{ "row": "<val>", "column": "<val>", "unit": "px", "isLinked": true }`.
  - Padding & Margin: Always specified as explicit quadruplets with linkage toggles: `{ "top": "<val>", "right": "<val>", "bottom": "<val>", "left": "<val>", "unit": "px", "isLinked": false }`.

### 11.2 Circular Statistics & Metric Badges
- In high-impact landing pages (gyms, fintech, SaaS), circular statistics and metric badges (e.g., `+70% Fitness Progress`, `500+ Members`) must be compiled into a circular container:
  - 1:1 Aspect ratio: `"width": { "unit": "px", "size": <diameter> }`, `"height": "min-height"`, `"custom_height": { "unit": "px", "size": <diameter> }`.
  - Border radius: `{ "top": "9999", "right": "9999", "bottom": "9999", "left": "9999", "unit": "px", "isLinked": true }`.
  - Centered alignment: `"flex_justify_content": "center"`, `"flex_align_items": "center"`.
  - Inner widgets: A `counter` widget with `starting_number: 0`, `ending_number: <value>`, `suffix`, `prefix`, and styling controls (`number_color`, `typography_number_font_size`), followed by a `text-editor` or `heading` widget for the description.

### 11.3 Hero Photography & Dynamic Cropping
- Athletic photographs, gym models, 3D artwork, and product screenshots must never be replaced by blank dummy rectangles.
- **Stage A (Vision Understanding):** The vision model localizes the visual boundary as a bounding box in root `assets` with `"sourceRect": { "x": ..., "y": ..., "width": ..., "height": ... }` and type `"image"`.
- **Pipeline Processing:** The asset extraction pipeline crops pixels using `sharp` from the source image buffer and persists it to local/B2 storage.
- **Stage B (Elementor Compilation):** The `image` widget receives `"image": { "url": asset.placeholder, "id": asset.id }` with `"alt_text"` and correct dimension/border-radius settings.

### 11.4 High-Impact CTA Buttons & Wide Headings
- High-visibility CTA buttons (e.g., orange `#ff5e14` or neon lime `#b7f34c`) must declare explicit `background_color`, high-contrast `button_text_color: "#ffffff"`, explicit `border_radius`, and `button_padding`.
- Wide hero headlines must preserve font size (40–64px), uppercase/bold styling where present, and container boxed width.

### 11.5 Deterministic Free Tier Fallback Reconstructions
When compiling for Elementor Free Tier without Pro plugins:
- **Pro Form:** Fallback to Free `html` widget containing semantic `<form>` with field groups and submit button.
- **Pro Nav Menu:** Fallback to inline `icon-list` navigation widget or horizontal Container link bar.
- **Pro Price Table:** Fallback to card Container (`elType: "container"` with border, radius, shadow) + `heading` + feature list + `button`.
- **Pro Call-to-Action (CTA):** Fallback to flex Container (`flex_direction: "row"`) with text column (`heading`, `text-editor`, `button`) and image column.

### 11.6 Explicit Architectural Invariants & Negative Constraints
1. **Never Bypass DIR:** Conversion must always proceed through the canonical `DIRDocument` schema. Direct one-shot image-to-Elementor prompts are strictly prohibited.
2. **Never Emit Legacy Section/Column:** Layout must strictly use modern Flexbox Containers (`elType: "container"`). Do not emit `elType: "section"` or `elType: "column"` for new layouts.
3. **Strict Numeric Types in DIR:** Dimensions, font sizes, line heights, borderWidth, and padding/margin inside DIR `styles` must be bare numbers, never CSS strings (e.g. `24`, not `"24px"`).
4. **Never Hallucinate Assets:** Media objects must reference valid cropped assets or authentic URLs. Missing assets must be left unconfigured or marked placeholder.

