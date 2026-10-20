# Elementor Widget Skill Set — SKILL.md

> **Version:** 1.0.0  
> **Source:** Elementor Core 4.3.5 verified widget registrations  
> **Last updated:** 2026-01-01

## Overview

This skill set provides runtime reference data for converting design analysis (DIR) into native Elementor JSON. It contains:

1. Widget registry (`widget-registry.json`) — list of all supported widgets with their categories, Core/Pro status, and control summaries.
2. Per-widget JSON profiles (`widgets/*.json`) — detailed control definitions, defaults, and setting schemas for each widget.
3. Layout reference (`layout-reference.json`) — Container, Section, Column structure and flex/grid configuration.

## Usage

The AI conversion pipeline should:

1. Load the widget registry at startup
2. For each DIR node, look up the corresponding widget profile by slug
3. Use the profile's control definitions to set correct Elementor settings
4. Validate generated settings against the profile's schema

## Widget Mapping

| DIR Node Kind | Elementor Widget | Notes |
|---|---|---|
| heading | heading | Core widget |
| text | text-editor | Core widget, uses HTML content |
| button | button | Core widget |
| image | image | Core widget |
| icon | icon | Core widget |
| icon-text | icon-box | Core widget |
| divider | divider | Core widget |
| spacer | spacer | Core widget |
| counter | counter | Core widget |
| progress-bar | progress | Core widget |
| rating | star-rating | Core widget |
| social-icons | social-icons | Core widget |
| video | video | Core widget |
| map | google_maps | Core widget, slug matches includes/widgets/google-maps.php |
| tabs | tabs | Core widget |
| accordion | accordion | Core widget |
| list | icon-list | Core widget, uses repeater |
| badge | container + heading | Pill container with 9999px radius, accent background, contrasting text |
| link | button / icon-list | Transparent action button or inline icon-list navigation item |
| card | container | Use Container with child widgets |
| container | container | elType='container' |
| flex-group | container | Container with flex settings |
| grid-group | container | Container with grid settings |

## Container Layout

Elementor 4.x uses Containers instead of legacy Section/Column.

```json
{
  "id": "unique-hex-id",
  "elType": "container",
  "settings": {
    "container_type": "flex",
    "flex_direction": "column",
    "flex_align_items": "center",
    "flex_justify_content": "center",
    "content_width": "boxed"
  },
  "elements": []
}
```

## Responsive Settings & Capabilities

Elementor 4.3.5 uses suffixed setting keys for responsive values (see `responsive-capabilities.json`):
- Desktop (default): `setting_name` (e.g., `flex_direction`, `typography_font_size`, `padding`)
- Tablet: `setting_name_tablet` (e.g., `flex_direction_tablet`, `typography_font_size_tablet`, `padding_tablet`)
- Mobile: `setting_name_mobile` (e.g., `flex_direction_mobile`, `typography_font_size_mobile`, `padding_mobile`)

Dimension values use the structure: `{ "unit": "px", "size": 16 }` or `{ "unit": "%", "size": 100 }`.

### Automatic Adaptations:
1. **Container Flex Reflow:** Desktop `flex_direction: "row"` automatically adapts to `column` on tablet/mobile when multi-column content is detected.
2. **CSS Grid Reflow:** Desktop 3+ columns reflow to 2 columns on tablet (`grid_columns_grid_tablet: { unit: 'fr', size: 2 }`) and 1 column on mobile (`grid_columns_grid_mobile: { unit: 'fr', size: 1 }`).
3. **Typography Scaling:** Headlines >= 44px scale down on tablet and mobile to prevent text clipping and viewport overflow.
4. **Viewport Clamping:** Desktop fixed container/image widths exceeding 360px receive `width_mobile: { unit: "%", size: 100 }`.
5. **Multi-Viewport Reconciliation:** Any explicit `responsiveOverrides` in DIR (tablet/mobile) take precedence and map directly into corresponding `_tablet` and `_mobile` Elementor controls.

