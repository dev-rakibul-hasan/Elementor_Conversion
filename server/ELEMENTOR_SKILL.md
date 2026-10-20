# Elementor Image-to-Template Skill

This document describes the implemented image → Design Intermediate Representation (DIR) → Elementor document pipeline. The runtime Zod schema in `src/modules/dir/schema.ts` defines accepted DIR; `src/modules/elementor/generator.ts` defines deterministic mappings; the Elementor registry and JSON catalog define known widget slugs and examples. This is an implementation guide, not a guarantee of import or visual fidelity on every WordPress site.

## 1. Architecture and execution flow

Image understanding and Elementor compilation are separate responsibilities. The canonical DIR document is the required boundary between them; do not ask the vision stage to emit Elementor JSON directly.

1. **Upload validation and metadata.** Authenticated upload routes accept PNG or JPEG image bytes. `validateImage` checks the actual file type and magic bytes, configured byte limit, readability, dimensions, and the 100-megapixel limit. The route computes a SHA-256 hash, stores the source, records width and height, and queues a conversion job.
2. **Image analysis.** The orchestrator builds the versioned image-analysis prompt and calls the AI router's vision role. It attempts to download and attach the source image as a data URI. A download failure is logged; provider availability and image capability depend on runtime configuration. The prompt can describe tiled input, but the orchestrator path shown here sends the source image directly and does not itself create analysis copies or tiles.
3. **Parse, normalize, and validate DIR.** AI output is parsed, normalized, metadata is made factual from the uploaded asset/provider response, and the result is checked against `dirDocumentSchema` and `validateDIR`.
4. **Bounded DIR repair.** When invalid, the orchestrator attempts section-level repairs for up to five isolated section indexes when there are no root errors, then retries whole-document repair at most twice. The section-repair implementation targets `pages[0].sections[index]` even when the reported error path names another page, so multi-page repair is not reliably page-aware. The result is normalized and validated again. Persistent invalidity or unparseable/truncated repair output fails the job rather than being treated as valid DIR.
5. **Asset resolution.** Referenced image assets are resolved. A usable `sourceRect` is tried first for a pixel crop; if missing or unsuccessful, a role/type-based heuristic crop is tried. Extracted images are uploaded and their storage URL is recorded as a placeholder. If extraction is unavailable, the original source URL or a generated SVG placeholder may be used. This is not guaranteed to identify the intended artwork.
6. **Elementor generation.** Outside `NODE_ENV=test`, if a structure provider is available, AI document generation is attempted and accepted only when the response is complete JSON and passes `validateElementor`. Otherwise the deterministic DIR compiler is used. A caught AI-generation failure is logged and falls back to the compiler. The AI path is optional, not guaranteed.
7. **Structural validation and optional healing.** The selected document is validated. AI self-healing is attempted only when OpenRouter is available and validation is invalid; it is accepted only if complete JSON passes validation. It is optional and is not a general visual-fidelity guarantee.
8. **Quality audit, serialization, and persistence.** The orchestrator runs a non-visual quality audit, serializes the document, uploads the JSON artifact, and persists DIR and Elementor artifacts. Serialization/persistence failures fail the job.
9. **Report and limitations.** The deterministic compiler returns a `ConversionReport`; the structural validator returns validity, errors, warnings, and traversal statistics. The orchestrator persists only a subset of these values and currently has a reporting defect described in §8.

The pipeline does not bypass DIR. A successful validator result only means that the checks implemented by that validator passed; it does not guarantee that WordPress imports, renders, or styles the document as intended.

## 2. Canonical DIR document

### Top-level fields

The Zod document schema is strict. Required fields are:

| Field | Accepted shape |
|---|---|
| `version` | Literal `"1.0.0"` |
| `meta` | Strict object described below |
| `breakpoints` | Strict object with required `desktop` and optional `tablet` / `mobile` |
| `globals` | Strict object with required colors and typography; optional spacing |
| `assets` | Array of strict asset objects (may be empty) |
| `pages` | Array of page objects; at least one page |
| `canvas_bounds` | Optional strict canvas-bounds object |

`meta` requires non-empty `sourceImageHash`, positive numeric `sourceWidth` and `sourceHeight`, string `analysisProvider`, `analysisModel`, and `analysisTimestamp`, `confidenceScore` from 0 through 1, literal `schemaVersion: "1.0.0"`, and string `promptVersion`. `notes` may be an array of strings; `canvas_bounds` is optional. The timestamp is only type-checked as a string. Although `DIRMeta` in `types.ts` also declares `elementorVersion`, strict Zod validation does **not** accept it in `meta`.

`breakpoints.desktop` requires numeric `min` and optionally numeric `max`. `tablet`, when present, requires numeric `min` and `max`; `mobile`, when present, requires numeric `min` and optionally numeric `max`. The schema does not constrain breakpoint ordering or specific pixel values.

`globals.colors` requires string `background` and `text`; the named `primary`, `secondary`, `accent`, `surface`, `textSecondary`, and `border` entries are optional strings. Additional color keys are permitted if their values are strings (or optional strings). `globals.typography` requires `fontFamilies: string[]` (the schema does not require a non-empty array); optional fields are `headingFont`, `bodyFont`, numeric `baseSize`, and numeric `scale`. Optional `globals.spacing` is strict and contains `unit: "px" | "rem"`, numeric `base`, and optional numeric `sectionGap` and `containerMaxWidth`.

### Pages, sections, and nodes

Sections belong under `pages[].sections[]`; `pages[]` contains page objects, not sections. A page requires non-empty string `id`, string `name`, and at least one section. A section requires non-empty string `id`, a role from the list below, confidence from 0 through 1, a `styles` object, and a `children` array. The children array may be empty at schema level. Optional section fields are `label`, `responsiveNotes: string[]`, `responsiveOverrides`, `canvas_bounds`, `direction: "row" | "column"`, numeric `gap`, string `justifyContent` and `alignItems`, and `layout_tree`.

Allowed section roles: `header`, `navigation`, `hero`, `feature`, `content`, `cta`, `testimonial`, `pricing`, `stats`, `gallery`, `team`, `faq`, `contact`, `form`, `footer`, `banner`, `logo-bar`, `generic`.

Every node requires non-empty string `id`, a supported `kind`, confidence from 0 through 1, and a `styles` object. The base node may also contain `label`, `responsiveOverrides`, `typography`, `form_details`, boolean `composite_graphic_asset`, and `layout_tree`. In the table, “optional” means not required by Zod; kind-specific objects themselves are strict.

| DIR kind | Additional required fields | Optional kind-specific fields |
|---|---|---|
| `container` | `children: node[]` | `direction: "row" \| "column"`, `wrap: boolean`, numeric `gap` |
| `flex-group` | `direction: "row" \| "column"`, `children: node[]` | string `justifyContent`, string `alignItems`, `wrap: boolean`, numeric `gap` |
| `grid-group` | positive integer `columns`, `children: node[]` | positive integer `rows`, numeric `gap` |
| `heading` | string `text`, `level: 1 \| 2 \| 3 \| 4 \| 5 \| 6` | string `htmlTag` |
| `text` | string `html` | string `text` |
| `button` | string `text` | string `url`, `variant: primary \| secondary \| outline \| ghost \| link`, `size: small \| medium \| large`, string `icon`, `iconPosition: left \| right` |
| `image` | — | string `assetId`, `alt`, `caption`; `objectFit: cover \| contain \| fill \| none`; string `aspectRatio`, `url`; positive numeric `width`, `height`; integer `seed`; string `prompt` |
| `icon` | — | string `iconName`, `iconLibrary` |
| `icon-text` | string `text` | string `iconName`, `iconLibrary`, `title` |
| `link` | string `text` | string `url` |
| `list` | `children: node[]` | boolean `ordered` |
| `list-item` | string `text` | string `icon` |
| `divider` | — | numeric `thickness` |
| `spacer` | numeric `height` | — |
| `card` | `children: node[]` | — |
| `form` | `children: node[]` | — |
| `input` | — | `inputType: text \| email \| password \| textarea \| select \| checkbox \| radio`; string `placeholder`, `label` |
| `video` | — | string `url`; `provider: youtube \| vimeo \| self-hosted` |
| `map` | — | string `location` |
| `social-icons` | `platforms: { name: string; url?: string }[]` | — |
| `counter` | numeric `value` | string `suffix`, `prefix`, `title` |
| `progress-bar` | numeric `value` | numeric `max`, string `label` |
| `tabs` | `tabs: { title: string; children: node[] }[]` | — |
| `accordion` | `items: { title: string; children: node[] }[]` | — |
| `rating` | numeric `value` | numeric `max` |
| `badge` | string `text` | — |
| `unknown` | — | string `description`, optional `children: node[]` |

All nodes inside container/card/form/list children and tab/accordion content are recursively validated DIR nodes. `confidence` is bounded; most other numeric fields do not have an explicit range beyond constraints noted above.

### Styles, metadata objects, and strictness

`styles` is a required strict object. Only these keys are accepted:

- Layout dimensions `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`: each accepts a **string or number**; the schema does not constrain string units.
- `padding` and `margin`: strict objects with optional numeric `top`, `right`, `bottom`, `left`; `gap`: number.
- Background strings: `backgroundColor`, `backgroundImage`, `backgroundGradient`, `backgroundSize`, `backgroundPosition`, `backgroundOverlay`.
- Typography: string `fontFamily`; numeric `fontSize`, `letterSpacing`; `fontWeight` and `lineHeight` each accept string or number; `textAlign: left | center | right | justify`; `textTransform: none | uppercase | lowercase | capitalize`; string `textDecoration` and `color`.
- Border: numeric `borderWidth`; string `borderColor`; `borderStyle: solid | dashed | dotted | none`; `borderRadius` is a number or strict optional numeric corners `topLeft`, `topRight`, `bottomRight`, `bottomLeft`.
- Shadow/display/flex: string `boxShadow`, `textShadow`, `display`, `position`, `overflow`, `justifyContent`, `alignItems`, `alignSelf`, `flexBasis`; numeric `opacity` constrained to 0–1, `zIndex`, `flexGrow`, `flexShrink`; `flexDirection: row | column`; `flexWrap: wrap | nowrap`.

`responsiveOverrides` is an optional strict record with only `tablet` and/or `mobile` keys. Each value is a partial `styles` object with the same allowed keys and value types. `typography`, when present, is strict: optional string `font_family_guess`, `color_hex`; numeric `font_size_px`, `letter_spacing_px`; string-or-number `font_weight`, `line_height_em`; and optional `inline_color_spans: { text, color_hex }[]`. `form_details`, when present, is a strict object containing optional `fields: { placeholder?, type?, background_hex?, border_radius_px? }[]`, `placeholder`, `background_hex`, numeric `border_radius_px` and `field_gap_px`, and `submit_button: { text?, width_type?: "auto" | "full", gradient_hex?, background_hex?, color_hex?, border_radius_px?, icon_position?: "left" | "right" | "none" }`.

`canvas_bounds` is strict and accepts optional boolean `crop_mockup`, `inner_bg_type: gradient | solid`, strings `primary_hex` and `secondary_hex`, and numeric `gradient_angle`, `x`, `y`, `width`, `height`.

An asset requires non-empty string `id`, `type: image | icon | logo | background | video | placeholder`, string `role`, and confidence from 0 through 1. Optional fields include positive `sourceRect.width` and `sourceRect.height`, numeric `sourceRect.x` and `.y`, strings `description` and `placeholder`, positive numeric `width` and `height`, integer `seed`, strings `prompt`, booleans `generated` and `composite_graphic_asset`, and arbitrary-object `metadata`. The schema does not check that a source rectangle lies within image bounds.

The document, meta, breakpoints, globals, typography, spacing, asset, source-rectangle, page, section, node, styles, spacing, corners, canvas-bounds, and outer `form_details` objects are strict: unknown keys are rejected by Zod. Exceptions include `globals.colors`, which permits additional optional string-valued keys, arbitrary `layout_tree` and asset `metadata` records, plus several nested objects/rows that are not strict (including form fields and submit button, social platform entries, tab/accordion rows, and inline color-span entries). Do not infer a stricter contract for these permissive nested records than the code enforces.

`validateDIR` additionally checks page/section/node ID duplication (including descendants visited through `children`, tabs, and accordion items) and reports duplicate IDs as `DUPLICATE_IDS`. IDs are not required to be unique against asset IDs, and duplicate asset IDs are not checked. Missing image asset references produce warnings, not errors; the current reference walk follows `children` only, so references nested only in tab/accordion content are not checked. Sections below confidence 0.5 produce warnings. There is no semantic source-rectangle bound check.

### Normalization is recovery, not an expanded contract

`normalizeDIR` / `normalizeNode` repair unambiguous common output issues before validation: they fill some document defaults, clamp confidence, convert selected numeric strings, map known margin/padding aliases, transfer a few typography/layout fields, infer certain missing text/heading/grid values, disentangle section-shaped objects from `pages[]`, and prune unknown node keys. `normalizeStyles` strips a small named set of common unsupported CSS keys. This is a recovery step, not permission to emit arbitrary CSS, unsupported node fields, or unknown schema keys. Ambiguous values such as `1.5rem` in numeric-only properties are not converted to guessed numbers; strict validation can still reject them.

## 3. DIR-to-Elementor mapping

The deterministic compiler processes the first DIR page and maps its sections to top-level `container` elements. Nested layout nodes become Containers; content nodes become widgets or, for badges and circular counters, a Container with a widget. A normal widget has `elType: "widget"`, its registered `widgetType`, `settings`, and an `elements` array. Containers use `elType: "container"` and nested children in `elements`. Generated element IDs are seven hexadecimal characters.

| Accepted DIR kind | Deterministic output | Settings / child behavior / limitations |
|---|---|---|
| `container`, `flex-group`, `card`, `form` | `elType: "container"` | Flex Container. Direction defaults to column. Child nodes are recursively compiled. A container whose children are all links instead becomes one `icon-list` widget (inline navigation repeater). `form` is only a layout container; it does not create a functioning form. |
| `grid-group` | `elType: "container"` | `container_type: "grid"`; `grid_columns_grid: {unit:"fr", size: columns}`; recursive children. Tablet columns use `min(2, max(1, columns - 1))`; mobile uses 1. Gap settings are emitted when gap is truthy. |
| `heading` | `heading` | `title`, `header_size: "h{level}"`; styles can map alignment, color and typography. |
| `text` | `text-editor` | `editor` gets DIR `html` (then text fallback); style alignment/color/typography may be applied. |
| `button` | `button` | `text`, URL object `{url, is_external:"", nofollow:""}` (unknown URL becomes `#`), and size `sm`/`md`/`lg`; background/text color, border, padding, typography as available. |
| `image` | `image` | `settings.image: {url, id}`, `image_size:"full"`, alignment; resolved node URL or referenced asset placeholder/URL is preferred. May fall back to another available asset or an SVG placeholder. |
| `icon` | `icon` | `selected_icon: {value, library}`; defaults to `fas fa-star` / `fa-solid`, maps a few names, and otherwise prefixes `fas fa-`. |
| `icon-text` | `icon-box` | `selected_icon`, `title_text`, `description_text`, `position:"top"`; absent icon name becomes a star; `iconLibrary` is not used by this branch. |
| `link` | `button` | Transparent button settings, text/link/color/typography; unknown URL becomes `#`. |
| `list` | `icon-list` | `view:"traditional"` and `icon_list` repeater rows with `_id`, text, icon object, and link. Children are interpreted as list items. |
| `list-item` | `text-editor` | Emits a paragraph from its text; it is not a standalone icon-list item except when consumed by a `list`. |
| `divider` | `divider` | `style:"solid"`, numeric thickness as `weight`, border color or `#E5E7EB`. |
| `spacer` | `spacer` | `space: {unit:"px", size: height}`. |
| `counter` | `counter` | `starting_number:0`, `ending_number`, prefix/suffix/title. Exact multiples of 1000 become `k` when suffix is absent. Circular styles with a background produce a wrapping Container. |
| `progress-bar` | `progress` | `title`, `percent:{unit:"%",size:value}`, `display_percentage:"show"`; `max` is not used. |
| `social-icons` | `social-icons` | `social_icon_list` rows with brand icon and link; unknown URL becomes `#`. |
| `tabs` | `tabs` | `settings.tabs` rows `{_id, tab_title, tab_content}`. Nested DIR children are flattened to basic HTML text/heading content; complex children are not preserved as nested widgets. |
| `accordion` | `accordion` | Same repeater shape as tabs; nested content is flattened. |
| `map` | `google_maps` | `address` reads `node.address` (not the schema's `location`) and otherwise defaults to a London address; zoom/height use branch defaults. |
| `video` | `video` | `video_type` reads `node.videoType` (not the schema's `provider`) and otherwise defaults to YouTube; missing URL becomes a hard-coded sample video URL. |
| `rating` | `star-rating` | `rating_scale:"5"`, rating, star style; `max` is not used. |
| `badge` | Container + `heading` | Accent/background fallback, inferred contrast text, pill-like radius and default padding if absent. The generated widget slug is `heading`, not `badge`. |
| `input` | `html` | Inline HTML input with placeholder/style. It always emits `type="text"`; schema `inputType`/`label` are not honored. It is not a native form-control integration. |
| `unknown` | `text-editor` fallback | Adds `node_kind:{kind}` to unsupported features and a warning; emits a basic fallback label. |

`types.ts` declares additional `image-box`, `testimonial`, `toggle`, `gallery`, and `image-gallery` kinds, and the generator has branches for them. **The runtime Zod schema does not accept these kinds** (they are absent from its discriminated union), so they are not valid canonical DIR and must not be claimed as supported input. The registry includes corresponding widget slugs for some of them; that does not make those DIR kinds schema-valid. Compiler branches also accept some ad hoc properties not present in the schema; they are not part of the canonical contract.

The compiler emits registered widget slugs such as `heading`, `text-editor`, `button`, `image`, `icon`, `icon-box`, `icon-list`, `divider`, `spacer`, `counter`, `progress`, `social-icons`, `tabs`, `accordion`, `google_maps`, `video`, `star-rating`, and `html`. A widget slug is distinct from a DIR node kind: for example, DIR `map` maps to `google_maps`, `rating` to `star-rating`, and `input` to `html`.

### Root document and settings

The deterministic document envelope is:

```json
{
  "version": "0.4",
  "elementor_version": "4.3.5",
  "wp_version": "6.8",
  "title": "Page title",
  "type": "page",
  "page_settings": {
    "template": "elementor_canvas",
    "background_background": "classic",
    "background_color": "#ffffff"
  },
  "content": []
}
```

The Elementor version is read from `source-version.json` (fallback `4.3.5`); `wp_version` is currently `6.8`. Page background comes from `globals.colors.background`, then surface, then white. Sections are modern Flexbox Containers, boxed to `globals.spacing.containerMaxWidth` or 1200px; tablet/mobile boxed widths are set to `min(768, maxWidth)` and 360px. A missing/transparent section background inherits the page background.

Common mappings include DIR background color to `background_background:"classic"` plus `background_color` on containers; padding/margin to Elementor dimension objects with string side values and linkage flags; dimensions to `{unit,size}`; and typography to the `typography_*` controls with `typography_typography:"custom"`. The generator maps a provided `backgroundImage` to a media object and optional position/size, but does not compile `backgroundGradient`. Global typography families and globals colors other than the page background are not automatically applied as a universal cascade: set styles on nodes where supported.

Media settings use `{url, id}`. Button/link destinations use Elementor link objects; never invent a real destination. Icon settings use objects such as `{value:"fas fa-check", library:"fa-solid"}`; available icon-library behavior depends on target Elementor. Repeaters use the widget-specific keys shown above. Widget profiles in `src/skills/elementor/widgets/` and the target installation determine whether uncommon control shapes actually import.

The generator does not generate legacy `section` or `column` elements: every DIR section and layout node is emitted as a modern `container`. Legacy Inner Section is present only as a reference example. The validator still recognizes legacy element types and reports a warning; this does not make them the preferred output.

## 4. Responsive behavior

The responsive capability matrix is `src/skills/elementor/responsive-capabilities.json`, version `1.0.0`. Its breakpoints are desktop from 1025px, tablet 768–1024px, and mobile 320–767px; tablet/mobile setting suffixes are `_tablet` and `_mobile`. The DIR schema merely stores numeric breakpoint bounds and does not enforce these values.

The matrix documents responsive controls for Containers (flex direction/justify/align/gap, width, boxed width, custom height, padding/margin, grid columns/gap, align-self) and selected widget controls: heading, text-editor, button, image, counter, icon-list, spacer, divider. Do not assume every Elementor control accepts responsive suffixes.

The deterministic generator applies responsive adaptations only in its coded cases:

- Non-header row sections and ordinary nested row groups receive tablet/mobile column directions. Header/navigation sections instead wrap on mobile; labeled header-action groups are handled specially.
- Grid tablet columns use `min(2, max(1, desktopColumns - 1))`; mobile is 1. Thus two desktop columns also become one on tablet in this compiler, despite a broader matrix description that may suggest otherwise.
- Typography font sizes: at least 44px scale to 0.8 tablet / 0.6 mobile (mobile minimum 24px); 28–43px scale to 0.85 / 0.72 (mobile minimum 20px); 18–27px gets mobile 0.88 (minimum 15px). Counter number sizes use their own 0.85 tablet / 0.7 mobile rule for sizes at least 28px.
- Container padding/margin styles are scaled; button padding has separate scales. Fixed numeric widths and images over certain thresholds may be reduced or clamped on tablet/mobile. Exact conditions differ by node and setting; this is not a universal formula.
- Explicit `responsiveOverrides` are translated for a subset of controls (flex direction/alignment/gap, padding/margin, font size/line height, text alignment, width, max width). Unsupported override keys are ignored by the mapper.

The report distinguishes explicit override count from inferred adaptation count. If only a desktop image is supplied, any responsive reconstruction is inference; do not present inferred behavior as observed evidence. Prefer actual mobile/tablet references when available and preserve their measured content and styles.

## 5. Image evidence and content fidelity

Describe only what is visible. Preserve legible text, image evidence, and observed layout; do not force a navigation bar, split hero, badge, artwork, palette, typography, or CTA into a design that does not contain it. Do not invent unreadable copy, URLs, map locations, media assets, or unsupported widgets.

An exact source-image crop is attempted only when an asset has a usable `sourceRect` and source bytes are available. The crop implementation clamps to image dimensions. If exact cropping is absent or fails, the orchestrator tries a heuristic region based on asset role/type; if that fails it can reference the whole source image or emit an SVG placeholder. These fallbacks can be unrelated to the intended asset. An image URL or placeholder being non-empty does not prove its content is correct.

## 6. Validation, fallback, and compatibility behavior

- **Invalid DIR:** normalization and bounded repairs may resolve it; if validation still fails, processing stops. There is no deterministic guarantee that an AI repair succeeds.
- **Vision response failure/truncation/invalid JSON:** parse errors fail the DIR stage. Truncated responses have their cache entry invalidated and fail if no complete parse is available.
- **Elementor AI generation:** unavailable provider, thrown error, truncated output, invalid JSON, or structurally invalid output leaves no accepted AI document and triggers the deterministic compiler. This attempt is skipped in test mode.
- **Compiler unknown nodes:** converts to a `text-editor` fallback and records an unsupported-feature warning. Some other fallbacks insert generic/default destinations or sample media; these should be reviewed, not mistaken for observed source content.
- **Assets:** exact cropping, heuristic crop, source-image URL, and generated placeholder are distinct outcomes. Missing source bytes can prevent extraction. The output can still be structurally valid while containing a placeholder.
- **Elementor validation:** checks document object/content array, IDs and duplicates, supported `elType`, widget type presence/registry recognition, settings object shape, and custom-code section shortcuts. It reports unknown widgets and legacy layouts as warnings. It does not validate every widget's required settings, all control value shapes, image existence, target-site extensions, or visual accuracy.
- **Self-healing:** only runs when validation is invalid and OpenRouter is available; only a complete healed response that passes the same structural validator is accepted. Otherwise the prior document remains and validation issues are logged.
- **Serialization and import:** serializer emits the template envelope and cleans some empty settings. Structural validation is not a WordPress import test. Verify the exported JSON on a compatible Elementor installation, confirm media/widget resolution, render it, and compare screenshots at matching viewports.

## 7. Prompt and reference versions

Current constants in `src/modules/conversion/prompts.ts`:

| Prompt | Version |
|---|---|
| `IMAGE_ANALYSIS` | `v2.1.0` |
| `ELEMENTOR_CONVERSION` | `v2.0.0` |
| `ELEMENTOR_SELF_HEALING` | `v1.0.0` |
| `DIR_REPAIR` | `v1.1.0` |
| `SECTION_REPAIR` | `v1.0.0` |

These values identify prompt/cache versions; the fixture values in tests are not the current production prompt constants.

Source/version and capability references:

- Widget catalog: `src/skills/elementor/widget-registry.json` contains **32 catalog elements**: 30 widget entries plus the Container and legacy Inner Section layout entries.
- Widget profile examples: `src/skills/elementor/widgets/*.json` contains **30 files**. Layout examples are in `src/skills/elementor/layout-elements/container.json` and `inner-section.json`.
- Responsive matrix: `src/skills/elementor/responsive-capabilities.json`.
- Source metadata: `src/skills/elementor/source-version.json` identifies Elementor Core 4.3.5 and says examples are not live-import certification.

The catalog's `reference_file` values point to `references/widgets/...` and `references/layout-elements/...`, paths that are not present in this checkout. The examples actually present are under `src/skills/elementor/widgets/` and `src/skills/elementor/layout-elements/`; do not claim the declared `references/` paths exist. The runtime TypeScript registry is a separate inventory: it declares 24 Core widget profiles plus 30 known Pro slugs (54 profiles before any directory loading), so that count is not the JSON catalog's 32 elements or the 30 on-disk widget examples.

## 8. Reproducible validation and test procedure

From the `server` directory, run the relevant offline suites:

```sh
npm test -- src/__tests__/e2e-pipeline.test.ts src/__tests__/responsive-pipeline.test.ts src/__tests__/dir-schema-repair-and-truncation.test.ts src/__tests__/conversion-quality-gate.test.ts src/__tests__/ai-routing-and-skills.test.ts
```

These tests exercise image-byte preprocessing with a generated synthetic PNG, schema validation using `src/__fixtures__/sample-dir.json`, deterministic compilation, structural validation, serialization, responsive settings, skill loading, and a mock publish path. The tests are separate stages: the generated PNG is **not** analyzed to create the fixture DIR. This checkout has no existing raster test image, and the offline tests do not exercise configured live image analysis or a complete uploaded-image-to-DIR run.

For an actual image-to-DIR-to-Elementor run, use an authorized test image, configured image-capable vision and structure/review providers as required, and the authenticated upload route. Record the uploaded image dimensions/hash, provider/model, prompt version, DIR artifact and `validateDIR` result, compiler/AI path, repair attempts, Elementor document, `validateElementor` errors/warnings/stats, and serialized artifact. Do not report an unexecuted provider call as a test. Keep generated artifacts outside the repository unless the application persists them through its normal storage.

### What existing reports expose

- `validateDIR`: `valid`, structured schema/semantic errors (`path`, `message`, `code`), and warnings. The orchestrator does not persist a complete DIR validation/repair-attempt report as a final job artifact.
- Deterministic `ConversionReport`: `widgetsUsed`, `unsupportedFeatures`, `warnings`, `elementCount`, `containerCount`, `widgetCount`, diagnostics, and responsive counts.
- `validateElementor`: `valid`, errors (`path`, `message`, `code` and optional element/widget identifiers), warnings, and stats (`totalElements`, containers, widgets, widget-type counts, max depth).
- The orchestrator's `elementor_validation` stage currently persists `valid`, `qualityAudit`, `widgetsUsed`, and `elementCount`; it does not persist validator errors, warnings, or stats there. The quality audit has its own counts and can throw on empty content or unresolved image URLs.

**Reporting discrepancy:** when AI Elementor generation is accepted, the orchestrator does not set the deterministic compiler's `report`, but later reads `report.widgetsUsed` and `report.elementCount` while persisting the validation stage and artifact. This can throw instead of completing the AI-generation path. Also, compiler report counts are not guaranteed to match the actual tree for composite output such as badges and circular counters. Treat complete job-level reporting/counts as unavailable until those implementation issues are addressed; this skill file is documentation-only and does not alter runtime code.

## 9. Completion checklist

- [ ] DIR is valid under the runtime Zod schema; sections are nested under `pages[].sections[]`.
- [ ] Image content, copy, colors, and geometry reflect evidence; inferred responsive decisions are identified as inferred.
- [ ] Asset references and crop outcomes are reviewed; heuristic crops/placeholders are not described as exact.
- [ ] Each emitted widget slug is registered and each setting has a target-compatible shape.
- [ ] Unsupported schema/compiler discrepancies and validator warnings are disclosed.
- [ ] JSON is serialized and structurally validated; job-level reporting limitations are not hidden.
- [ ] Import and render are verified on the intended Elementor/WordPress installation before claiming target compatibility or visual fidelity.
