# Elementor source widget and JSON reference

- Source archive: `elementor.zip`
- Version in `elementor/elementor.php`: **4.3.5**
- Extracted code root: `elementor/`
- Inventory is based on source declarations and registration paths; active runtime registry can vary with WordPress widgets, Pro/plugin extensions, feature flags, and site configuration.

## Native Elementor content JSON

The page content saved in `_elementor_data` is a JSON-encoded array of element nodes. The source methods `Element_Base::get_raw_data()`, `Widget_Base::get_raw_data()`, and `Core\Base\Document::get_export_data()` show the shape and the export wrapper.

```json
[
  {
    "id": "a1b2c3d4",
    "elType": "container",
    "settings": { "content_width": "full", "flex_direction": "row" },
    "elements": [
      {
        "id": "e5f6g7h8",
        "elType": "widget",
        "widgetType": "heading",
        "settings": { "title": "Example heading", "header_size": "h2", "align": "left" },
        "elements": []
      }
    ],
    "isInner": false
  }
]
```

Schema notes:
- `id`: unique element instance ID; export processing may regenerate it.
- `elType`: structural element type such as `container`, legacy `section`/`column`, or `widget`.
- `widgetType`: classic widget slug such as `heading`, `image`, `text-editor`, `button`; required for `elType: "widget"`.
- `settings`: widget/container control values, not arbitrary HTML props. Type and nesting follow each control definition (e.g. URL/media object, repeater array, responsive control values).
- `elements`: nested child nodes. In saved data this key may be omitted for a leaf; raw editor data includes children as an array.
- `isInner`: structural context on non-widget elements; `Widget_Base::get_raw_data()` explicitly removes this from widget nodes.
- `isLocked` may exist on locked elements. Raw editor data may include `htmlCache` if requested; do not treat it as widget settings.
- Post/page settings are separate from content (`_elementor_page_settings`). Document export data uses `content`, `settings`, and `metadata`; template library wrappers may expose `page_settings` and other fields as an outer format.

## Widget settings are control schemas, not generic HTML attributes

The keys under `settings` come from each widget's `register_controls()` (classic/nested widgets) or its declared prop schema (Atomic family). The display label in the editor is not necessarily the saved key. A widget can also receive shared controls through `common-base` / `common-optimized`, traits, group controls, responsive control generation, and plugin hooks.

Common classic value patterns visible in this source include:

- URL controls such as a widget `link`: an object with URL and link behavior options; keep the original subkeys and values.
- Media controls such as `image`: an object (not just a bare image URL); preserve attachment ID and source details when present.
- Icon controls such as `selected_icon`: usually an object containing `value` and `library`; icons are not plain label text.
- Repeater controls such as classic Accordion/Tabs `tabs`, Icon List `icon_list`, and Social Icons `social_icon_list`: arrays of row objects whose row keys are defined in that repeater.
- Group controls such as typography, border, background, shadow, and image size: they generate related settings keys; map those keys from the group's declared name, not from the UI group label.
- Responsive controls may produce device-specific settings (e.g. the base value plus tablet/mobile variants); do not collapse them to one desktop value when fidelity requires responsiveness.
- Global styles and dynamic tags can be represented in special settings metadata such as `__globals__` or `__dynamic__`; these are not ordinary visible text fields and must not be discarded blindly.

Representative repeater row keys verified in source:

| Widget setting key | Repeater row fields defined in source |
|---|---|
| Classic Accordion `tabs` | `tab_title`, `tab_content` |
| Classic Tabs `tabs` | `tab_title`, `tab_content` |
| Classic Toggle `tabs` | `tab_title`, `tab_content` |
| Icon List `icon_list` | `text`, `selected_icon`, `link` |
| Social Icons `social_icon_list` | `social_icon`, `link`, `item_icon_color`, `item_icon_primary_color`, `item_icon_secondary_color` |
| Classic Button (via Button_Trait) | `button_type`, `text`, `link`, `size`, `selected_icon`, `icon_align`, `icon_indent`, `button_css_id`; style controls also include `align`, `content_align` and typography/background/border/shadow values |

These patterns are guides to the source-backed shape; the full list of each widget's local control declarations is indexed below. Nested/Atomic widgets may store content as actual child elements rather than repeater HTML strings.

## Atomic widget JSON is a separate data model

This source has an Atomic widget system in addition to classic Elementor widgets. `Atomic_Widget_Base` adds `version`, `styles`, `interactions`, and `editor_settings` during raw/save serialization, and `Has_Atomic_Base` validates `settings` against a declared prop schema. Atomic prop values use a typed envelope, typically `{"$$type":"string","value":"..."}` (the type depends on the property). For example, the Atomic Heading type is `widgetType: "e-heading"`, with a schema for `title`, `tag`, `link`, `classes`, and `attributes`; its `title` property uses the `escaped-html` type. The source also includes nested Atomic elements for tabs, accordions, lists, and background video. Do not serialize these as if they were classic `heading`/`accordion` settings. The converter's target must still follow the user's agreed DIR and the installed target site's enabled Elementor widget family; the presence of Atomic code in this archive is not by itself a reason to introduce a new IR or target Atomic nodes.

## Built-in classic widgets (manager registry)

Core registration is the explicit `$build_widgets_filename` list in `includes/managers/widgets.php`. `common-base`, `common`, and `common-optimized` are shared-control/helper implementations, not ordinary user-facing widgets; `Widget_WordPress` is a bridge for runtime WordPress widgets. Plugin/Pro widgets may extend the runtime registry.

### `inner-section` — esc_html__( 'Inner Section', 'elementor' )
- Source: `includes/widgets/inner-section.php`.
- Local control calls: none found in this file; inspect its inherited/trait/element implementation.
- Note: Legacy layout element; its node type is `section` (with child `column` nodes), not a normal `widget` node.

### `heading` — esc_html__( 'Heading', 'elementor' )
- Source: `includes/widgets/heading.php`.
- Control sections: 'section_title', 'section_title_style'.
- Local controls / group controls: 'title', 'link', 'size', 'header_size', 'blend_mode', 'separator', 'title_color', 'title_hover_color', 'title_hover_color_transition_duration', $notice_id, 'align', Group_Control_Typography::get_type() (name=typography) [group], Group_Control_Text_Stroke::get_type() (name=text_stroke) [group], Group_Control_Text_Shadow::get_type() (name=text_shadow) [group].

### `image` — esc_html__( 'Image', 'elementor' )
- Source: `includes/widgets/image.php`.
- Control sections: 'section_image', 'section_style_image', 'section_style_caption'.
- Local controls / group controls: 'image', 'caption_source', 'caption', 'link_to', 'link', 'open_lightbox', 'separator_panel_style', 'opacity', 'opacity_hover', 'background_hover_transition', 'hover_animation', 'text_color', 'caption_background_color', 'align', 'width', 'space', 'height', 'object-fit', 'object-position', 'image_border_radius', 'caption_align', 'caption_space', Group_Control_Image_Size::get_type() (name=image) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group], Group_Control_Border::get_type() (name=image_border) [group], Group_Control_Box_Shadow::get_type() (name=image_box_shadow) [group], Group_Control_Typography::get_type() (name=caption_typography) [group], Group_Control_Text_Shadow::get_type() (name=caption_text_shadow) [group].

### `text-editor` — esc_html__( 'Text Editor', 'elementor' )
- Source: `includes/widgets/text-editor.php`.
- Control sections: 'section_editor', 'section_style', 'section_drop_cap'.
- Local controls / group controls: 'editor', 'drop_cap', 'separator', 'text_color', 'link_color', 'link_hover_color', 'link_hover_color_transition_duration', 'drop_cap_view', 'drop_cap_primary_color', 'drop_cap_secondary_color', 'drop_cap_size', 'drop_cap_space', 'drop_cap_border_radius', 'drop_cap_border_width', 'text_columns', 'column_gap', 'align', 'paragraph_spacing', Group_Control_Typography::get_type() (name=typography) [group], Group_Control_Text_Shadow::get_type() (name=text_shadow) [group], Group_Control_Text_Shadow::get_type() (name=drop_cap_shadow) [group], Group_Control_Typography::get_type() (name=drop_cap_typography) [group].

### `video` — esc_html__( 'Video', 'elementor' )
- Source: `includes/widgets/video.php`.
- Control sections: 'section_video', 'section_image_overlay', 'section_video_style', 'section_image_overlay_style', 'section_lightbox_style'.
- Local controls / group controls: 'video_type', 'youtube_url', 'vimeo_url', 'dailymotion_url', 'insert_url', 'hosted_url', 'external_url', 'videopress_url', 'start', 'end', 'video_options', 'autoplay', 'play_on_mobile', 'mute', 'loop', 'controls', 'showinfo', 'cc_load_policy', 'logo', 'yt_privacy', 'lazy_load', 'rel', 'vimeo_title', 'vimeo_portrait', 'vimeo_byline', 'color', 'download_button', 'preload', 'poster', 'show_image_overlay', 'image_overlay', 'show_play_icon', 'play_icon', 'lightbox', 'aspect_ratio', 'play_icon_title', 'play_icon_color', 'lightbox_color', 'lightbox_ui_color', 'lightbox_ui_color_hover', 'deprecation_warning', 'lightbox_video_width', 'lightbox_content_position', 'play_icon_size', 'lightbox_content_animation', Group_Control_Image_Size::get_type() (name=image_overlay) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Text_Shadow::get_type() (name=play_icon_text_shadow) [group].

### `button` — esc_html__( 'Button', 'elementor' )
- Source: `includes/widgets/button.php`.
- Control sections: 'section_button', 'section_style'.
- Local control calls: none found in this file; inspect its inherited/trait/element implementation.
- Note: Button content/style fields are supplied by `includes/widgets/traits/button-trait.php` via `register_button_content_controls()` and `register_button_style_controls()`.

### `divider` — esc_html__( 'Divider', 'elementor' )
- Source: `includes/widgets/divider.php`.
- Control sections: 'section_divider', 'section_divider_style', 'section_text_style', 'section_icon_style'.
- Local controls / group controls: 'style', 'separator_type', 'pattern_spacing_flag', 'pattern_round_flag', 'look', 'text', 'html_tag', 'icon', 'color', 'weight', 'pattern_height', 'pattern_size', 'text_color', 'text_align', 'icon_view', 'icon_padding', 'primary_color', 'secondary_color', 'icon_align', 'icon_border_width', 'border_radius', 'width', 'align', 'gap', 'text_spacing', 'icon_size', 'icon_spacing', 'rotate', Group_Control_Typography::get_type() (name=typography) [group], Group_Control_Text_Stroke::get_type() (name=text_stroke) [group].

### `spacer` — esc_html__( 'Spacer', 'elementor' )
- Source: `includes/widgets/spacer.php`.
- Control sections: 'section_spacer'.
- Local controls / group controls: 'space'.

### `image-box` — esc_html__( 'Image Box', 'elementor' )
- Source: `includes/widgets/image-box.php`.
- Control sections: 'section_image', 'section_style_box', 'section_style_image', 'section_style_content'.
- Local controls / group controls: 'image', 'title_text', 'description_text', 'link', 'title_size', 'separator_panel_style', 'image_opacity', 'image_opacity_hover', 'background_hover_transition', 'hover_animation', 'heading_title', 'title_color', 'hover_title_color', 'hover_title_color_transition_duration', 'heading_description', 'description_color', 'position', 'content_vertical_alignment', 'text_align', 'image_space', 'title_bottom_space', 'image_size', 'image_height', 'image_object_fit', 'image_object_position', 'image_border_radius', Group_Control_Image_Size::get_type() (name=thumbnail) [group], Group_Control_Border::get_type() (name=image_border) [group], Group_Control_Box_Shadow::get_type() (name=image_box_shadow) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group], Group_Control_Typography::get_type() (name=title_typography) [group], Group_Control_Text_Stroke::get_type() (name=title_stroke) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=description_typography) [group], Group_Control_Text_Shadow::get_type() (name=description_shadow) [group].

### `google_maps` — Google Maps
- Source: `includes/widgets/google-maps.php`.
- Control sections: 'section_map', 'section_map_style'.
- Local controls / group controls: 'api_key_notification', 'address', 'zoom', 'hover_transition', 'height', Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group].

### `icon` — esc_html__( 'Icon', 'elementor' )
- Source: `includes/widgets/icon.php`.
- Control sections: 'section_icon', 'section_style_icon'.
- Local controls / group controls: 'selected_icon', 'view', 'shape', 'link', 'primary_color', 'secondary_color', 'hover_primary_color', 'hover_secondary_color', 'hover_animation', 'fit_to_size', 'icon_padding', 'border_width', 'align', 'size', 'rotate', 'border_radius'.

### `icon-box` — esc_html__( 'Icon Box', 'elementor' )
- Source: `includes/widgets/icon-box.php`.
- Control sections: 'section_icon', 'section_style_box', 'section_style_icon', 'section_style_content'.
- Local controls / group controls: 'selected_icon', 'view', 'shape', 'title_text', 'description_text', 'link', 'title_size', 'primary_color', 'secondary_color', 'hover_primary_color', 'hover_secondary_color', 'hover_icon_colors_transition_duration', 'hover_animation', 'heading_title', 'title_color', 'hover_title_color', 'hover_title_color_transition_duration', 'heading_description', 'description_color', 'position', 'content_vertical_alignment', 'text_align', 'icon_space', 'title_bottom_space', 'icon_size', 'icon_padding', 'rotate', 'border_width', 'border_radius', Group_Control_Typography::get_type() (name=title_typography) [group], Group_Control_Text_Stroke::get_type() (name=text_stroke) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=description_typography) [group], Group_Control_Text_Shadow::get_type() (name=description_shadow) [group].

### `star-rating` — esc_html__( 'Star Rating', 'elementor' )
- Source: `includes/widgets/star-rating.php`.
- Control sections: 'section_rating', 'section_title_style', 'section_stars_style'.
- Local controls / group controls: 'rating_scale', 'rating', 'star_style', 'unmarked_star_style', 'title', 'title_color', 'stars_color', 'stars_unmarked_color', 'align', 'title_gap', 'icon_size', 'icon_space', Group_Control_Typography::get_type() (name=title_typography) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group].

### `image-carousel` — esc_html__( 'Image Carousel', 'elementor' )
- Source: `includes/widgets/image-carousel.php`.
- Control sections: 'section_image_carousel', 'section_additional_options', 'section_style_navigation', 'section_style_image', 'section_caption'.
- Local controls / group controls: 'carousel_name', 'carousel', 'image_stretch', 'navigation', 'navigation_previous_icon', 'navigation_next_icon', 'link_to', 'link', 'open_lightbox', 'caption_type', 'lazyload', 'autoplay', 'pause_on_hover', 'pause_on_interaction', 'autoplay_speed', 'infinite', 'effect', 'speed', 'direction', 'heading_style_arrows', 'arrows_position', 'arrows_color', 'heading_style_dots', 'dots_position', 'dots_inactive_color', 'dots_color', 'image_spacing', 'caption_text_color', 'slides_to_show', 'slides_to_scroll', 'arrows_size', 'dots_gap', 'dots_size', 'gallery_vertical_align', 'image_spacing_custom', 'image_border_radius', 'caption_align', 'caption_space', Group_Control_Image_Size::get_type() (name=thumbnail) [group], Group_Control_Border::get_type() (name=image_border) [group], Group_Control_Typography::get_type() (name=caption_typography) [group], Group_Control_Text_Shadow::get_type() (name=caption_shadow) [group].

### `image-gallery` — esc_html__( 'Basic Gallery', 'elementor' )
- Source: `includes/widgets/image-gallery.php`.
- Control sections: 'section_gallery', 'section_gallery_images', 'section_caption'.
- Local controls / group controls: 'wp_gallery', 'gallery_columns', 'gallery_display_caption', 'gallery_link', 'open_lightbox', 'gallery_rand', 'image_spacing', 'image_spacing_custom', 'text_color', 'image_border_radius', 'align', 'caption_space', Group_Control_Image_Size::get_type() (name=thumbnail) [group], Group_Control_Border::get_type() (name=image_border) [group], Group_Control_Typography::get_type() (name=typography) [group], Group_Control_Text_Shadow::get_type() (name=caption_shadow) [group].

### `icon-list` — esc_html__( 'Icon List', 'elementor' )
- Source: `includes/widgets/icon-list.php`.
- Control sections: 'section_icon', 'section_icon_list', 'section_icon_style', 'section_text_style'.
- Local controls / group controls: 'view', 'icon_list', 'link_click', 'divider', 'divider_style', 'divider_weight', 'divider_width', 'divider_height', 'divider_color', 'icon_color', 'icon_color_hover', 'icon_color_hover_transition', 'text_indent', 'text_color', 'text_color_hover', 'text_color_hover_transition', 'space_between', 'icon_align', 'icon_size', 'icon_self_align', 'icon_self_vertical_align', 'icon_vertical_offset', Group_Control_Typography::get_type() (name=icon_typography) [group], Group_Control_Text_Shadow::get_type() (name=text_shadow) [group].

### `counter` — esc_html__( 'Counter', 'elementor' )
- Source: `includes/widgets/counter.php`.
- Control sections: 'section_counter', 'section_counter_style', 'section_number', 'section_title'.
- Local controls / group controls: 'starting_number', 'ending_number', 'prefix', 'suffix', 'duration', 'thousand_separator', 'thousand_separator_char', 'title', 'title_tag', 'number_color', 'title_color', 'title_position', 'title_horizontal_alignment', 'title_vertical_alignment', 'title_gap', 'number_position', 'number_alignment', 'number_gap', Group_Control_Typography::get_type() (name=typography_number) [group], Group_Control_Text_Stroke::get_type() (name=number_stroke) [group], Group_Control_Text_Shadow::get_type() (name=number_shadow) [group], Group_Control_Typography::get_type() (name=typography_title) [group], Group_Control_Text_Stroke::get_type() (name=title_stroke) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group].

### `progress` — esc_html__( 'Progress Bar', 'elementor' )
- Source: `includes/widgets/progress.php`.
- Control sections: 'section_progress', 'section_progress_style'.
- Local controls / group controls: 'title', 'title_tag', 'title_display', 'progress_type', 'percent', 'display_percentage', 'inner_text', 'title_heading', 'title_color', 'percentage_heading', 'bar_color', 'bar_bg_color', 'bar_height', 'bar_border_radius', 'inner_text_heading', 'bar_inline_color', Group_Control_Typography::get_type() (name=typography) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=bar_inner_typography) [group], Group_Control_Text_Shadow::get_type() (name=bar_inner_shadow) [group].

### `testimonial` — esc_html__( 'Testimonial', 'elementor' )
- Source: `includes/widgets/testimonial.php`.
- Control sections: 'section_testimonial', 'section_style_testimonial_content', 'section_style_testimonial_image', 'section_style_testimonial_name', 'section_style_testimonial_job'.
- Local controls / group controls: 'testimonial_content', 'testimonial_image', 'testimonial_name', 'testimonial_job', 'link', 'testimonial_image_position', 'content_content_color', 'name_text_color', 'job_text_color', 'testimonial_alignment', 'image_size', 'image_border_radius', Group_Control_Image_Size::get_type() (name=testimonial_image) [group], Group_Control_Typography::get_type() (name=content_typography) [group], Group_Control_Text_Shadow::get_type() (name=content_shadow) [group], Group_Control_Border::get_type() (name=image_border) [group], Group_Control_Typography::get_type() (name=name_typography) [group], Group_Control_Text_Shadow::get_type() (name=name_shadow) [group], Group_Control_Typography::get_type() (name=job_typography) [group], Group_Control_Text_Shadow::get_type() (name=job_shadow) [group].

### `tabs` — esc_html__( 'Tabs', 'elementor' )
- Source: `includes/widgets/tabs.php`.
- Control sections: 'section_tabs', 'section_tabs_style'.
- Local controls / group controls: 'tabs', 'type', 'tabs_align_horizontal', 'tabs_align_vertical', 'navigation_width', 'border_width', 'border_color', 'background_color', 'heading_title', 'tab_color', 'tab_active_color', 'title_align', 'heading_content', 'content_color', Group_Control_Typography::get_type() (name=tab_typography) [group], Group_Control_Text_Stroke::get_type() (name=text_stroke) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=content_typography) [group], Group_Control_Text_Shadow::get_type() (name=content_shadow) [group].

### `accordion` — esc_html__( 'Accordion', 'elementor' )
- Source: `includes/widgets/accordion.php`.
- Control sections: 'section_title', 'section_title_style', 'section_toggle_style_title', 'section_toggle_style_icon', 'section_toggle_style_content'.
- Local controls / group controls: 'tabs', 'selected_icon', 'selected_active_icon', 'title_html_tag', 'faq_schema', 'border_width', 'border_color', 'title_background', 'title_color', 'tab_active_color', 'icon_align', 'icon_color', 'icon_active_color', 'content_background_color', 'content_color', 'title_padding', 'icon_space', 'content_padding', Group_Control_Typography::get_type() (name=title_typography) [group], Group_Control_Text_Stroke::get_type() (name=text_stroke) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=content_typography) [group], Group_Control_Text_Shadow::get_type() (name=content_shadow) [group].

### `toggle` — esc_html__( 'Toggle', 'elementor' )
- Source: `includes/widgets/toggle.php`.
- Control sections: 'section_toggle', 'section_toggle_style', 'section_toggle_style_title', 'section_toggle_style_icon', 'section_toggle_style_content'.
- Local controls / group controls: 'tabs', 'selected_icon', 'selected_active_icon', 'title_html_tag', 'faq_schema', 'border_width', 'border_color', 'title_background', 'title_color', 'tab_active_color', 'icon_align', 'icon_color', 'icon_active_color', 'content_background_color', 'content_color', 'space_between', 'title_padding', 'icon_space', 'content_padding', Group_Control_Box_Shadow::get_type() (name=box_shadow) [group], Group_Control_Typography::get_type() (name=title_typography) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=content_typography) [group], Group_Control_Text_Shadow::get_type() (name=content_shadow) [group].

### `social-icons` — esc_html__( 'Social Icons', 'elementor' )
- Source: `includes/widgets/social-icons.php`.
- Control sections: 'section_social_icon', 'section_social_style', 'section_social_hover'.
- Local controls / group controls: 'social_icon_list', 'shape', 'icon_color', 'icon_primary_color', 'icon_secondary_color', 'hover_primary_color', 'hover_secondary_color', 'hover_border_color', 'hover_animation', 'columns', 'align', 'icon_size', 'icon_padding', 'icon_spacing', 'row_gap', 'border_radius', Group_Control_Border::get_type() (name=image_border) [group].

### `alert` — esc_html__( 'Alert', 'elementor' )
- Source: `includes/widgets/alert.php`.
- Control sections: 'section_alert', 'section_type', 'section_title', 'section_description', 'section_dismiss_icon'.
- Local controls / group controls: 'alert_type', 'alert_title', 'alert_description', 'show_dismiss', 'dismiss_icon', 'background', 'border_color', 'border_left-width', 'title_color', 'description_color', 'dismiss_icon_normal_color', 'dismiss_icon_hover_color', 'dismiss_icon_hover_transition_duration', 'dismiss_icon_size', 'dismiss_icon_vertical_position', 'dismiss_icon_horizontal_position', Group_Control_Typography::get_type() (name=alert_title) [group], Group_Control_Text_Shadow::get_type() (name=title_shadow) [group], Group_Control_Typography::get_type() (name=alert_description) [group], Group_Control_Text_Shadow::get_type() (name=description_shadow) [group].

### `audio` — esc_html__( 'SoundCloud', 'elementor' )
- Source: `includes/widgets/audio.php`.
- Control sections: 'section_audio'.
- Local controls / group controls: 'link', 'visual', 'sc_options', 'sc_auto_play', 'sc_buying', 'sc_liking', 'sc_download', 'sc_show_artwork', 'sc_sharing', 'sc_show_comments', 'sc_show_playcount', 'sc_show_user', 'sc_color'.
- Note: UI title is SoundCloud in this version.

### `shortcode` — esc_html__( 'Shortcode', 'elementor' )
- Source: `includes/widgets/shortcode.php`.
- Control sections: 'section_shortcode'.
- Local controls / group controls: 'shortcode'.

### `html` — esc_html__( 'HTML', 'elementor' )
- Source: `includes/widgets/html.php`.
- Control sections: 'section_title'.
- Local controls / group controls: 'html'.

### `menu-anchor` — esc_html__( 'Menu Anchor', 'elementor' )
- Source: `includes/widgets/menu-anchor.php`.
- Control sections: 'section_anchor'.
- Local controls / group controls: 'anchor', 'anchor_note'.

### `sidebar` — esc_html__( 'Sidebar', 'elementor' )
- Source: `includes/widgets/sidebar.php`.
- Control sections: 'section_sidebar'.
- Local controls / group controls: 'sidebar'.

### `read-more` — esc_html__( 'Read More', 'elementor' )
- Source: `includes/widgets/read-more.php`.
- Control sections: 'section_title'.
- Local controls / group controls: 'theme_support', 'link_text'.

### `rating` — esc_html__( 'Rating', 'elementor' )
- Source: `includes/widgets/rating.php`.
- Control sections: 'section_icon_style', 'section_rating'.
- Local controls / group controls: 'icon_color', 'icon_unmarked_color', 'rating_scale', 'rating_value', 'rating_icon', 'icon_size', 'icon_gap', 'icon_alignment'.
- Note: This is a separate Rating widget; do not confuse it with `star-rating`.

## Additional module widget implementations

These are in the source tree but registration/visibility depends on the corresponding module, feature, dependencies, Pro availability, or experiment state. They are not automatically interchangeable with the classic widget slugs above.

### `get_element_type=Atomic_Accordion::ELEMENT_TYPE_ITEM` — esc_html__( 'Accordion Item', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion-item/atomic-accordion-item.php`; class `Atomic_Accordion_Item`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=Atomic_Accordion::ELEMENT_TYPE_CONTENT` — esc_html__( 'Content', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion-item-content/atomic-accordion-item-content.php`; class `Atomic_Accordion_Item_Content`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=Atomic_Accordion::ELEMENT_TYPE_HEADER` — esc_html__( 'Header', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion-item-header/atomic-accordion-item-header.php`; class `Atomic_Accordion_Item_Header`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; show_icon:Boolean_Prop_Type default=true.

### `get_element_type=Atomic_Accordion::ELEMENT_TYPE_ICON` — esc_html__( 'Icon', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion-item-icon/atomic-accordion-item-icon.php`; class `Atomic_Accordion_Item_Icon`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=Atomic_Accordion::ELEMENT_TYPE_TITLE` — esc_html__( 'Title', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion-item-title/atomic-accordion-item-title.php`; class `Atomic_Accordion_Item_Title`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-accordion'` — esc_html__( 'Accordion', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-accordion/atomic-accordion.php`; class `Atomic_Accordion`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type; default_state:String_Prop_Type default='first_expanded'; show_icon:Boolean_Prop_Type default=true; faq_schema:Boolean_Prop_Type default=false.

### `get_element_type='e-background-video-content'` — esc_html__( 'Content Area', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-background-video/atomic-background-video-content/atomic-background-video-content.php`; class `Atomic_Background_Video_Content`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-background-video-controls'` — esc_html__( 'Controls', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-background-video/atomic-background-video-controls/atomic-background-video-controls.php`; class `Atomic_Background_Video_Controls`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-background-video-pause'` — esc_html__( 'Pause Button', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-background-video/atomic-background-video-pause/atomic-background-video-pause.php`; class `Atomic_Background_Video_Pause`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-background-video-play'` — esc_html__( 'Play Button', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-background-video/atomic-background-video-play/atomic-background-video-play.php`; class `Atomic_Background_Video_Play`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-background-video'` — esc_html__( 'Background Video', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-background-video/atomic-background-video.php`; class `Atomic_Background_Video`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; tag:String_Prop_Type default='div'; source:Video_Src_Prop_Type alias='video', 'src'; start_time:Number_Prop_Type default=null; end_time:Number_Prop_Type default=null; autoplay:Boolean_Prop_Type default=true; mute:Boolean_Prop_Type default=true; loop:Boolean_Prop_Type default=true; show_controls:Boolean_Prop_Type default=true; state:String_Prop_Type default='playing'; attributes:Attributes_Prop_Type.

### `get_element_type='e-button'` — esc_html__( 'Button', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-button/atomic-button.php`; class `Atomic_Button`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; text:Escaped_Html_Prop_Type default=__( 'Click here', 'elementor' alias='content', 'label'; link:Link_Prop_Type; tag:String_Prop_Type default='button'; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'Loop', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-collection-loop/collection-loop-promotion.php`; class `Collection_Loop_Promotion`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[].

### `get_element_type='e-divider'` — esc_html__( 'Divider', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-divider/atomic-divider.php`; class `Atomic_Divider`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'Atomic Form', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-form/atomic-form-promotion.php`; class `Atomic_Form_Promotion`.

### `get_element_type=self::get_type()` — esc_html__( 'Atomic form', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-form/atomic-form.php`; class `Atomic_Form`.
- Atomic prop schema candidates: submissions_metadata:String_Array_Prop_Type default=[
					String_Prop_Type::generate( self::METADATA_REMOTE_IP; webhook_url:String_Prop_Type default=''; attributes:Attributes_Prop_Type.

### `(inherited/dynamic)` — title inherited
- Source: `modules/atomic-widgets/elements/atomic-form/form-message/form-message.php`; class `Form_Message`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-heading'` — esc_html__( 'Heading', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-heading/atomic-heading.php`; class `Atomic_Heading`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; tag:String_Prop_Type default='h2'; title:Escaped_Html_Prop_Type default=__( 'This is a title', 'elementor' alias='text', 'content', 'heading'; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type='e-image'` — esc_html__( 'Image', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-image/atomic-image.php`; class `Atomic_Image`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; image:Image_Prop_Type; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'List', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-list/atomic-list/atomic-list.php`; class `Atomic_List`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; tag:String_Prop_Type default='ul'; show_markers:Boolean_Prop_Type default=true; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'List item', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-list/atomic-list-item/atomic-list-item.php`; class `Atomic_List_Item`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; show_markers:Boolean_Prop_Type default=true; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'List item content', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-list/atomic-list-item-content/atomic-list-item-content.php`; class `Atomic_List_Item_Content`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'List item marker', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-list/atomic-list-item-marker/atomic-list-item-marker.php`; class `Atomic_List_Item_Marker`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type=self::get_type()` — esc_html__( 'List', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-list/atomic-list.php`; class `Atomic_List`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-paragraph'` — esc_html__( 'Paragraph', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-paragraph/atomic-paragraph.php`; class `Atomic_Paragraph`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; paragraph:Escaped_Html_Prop_Type default=__( 'Type your paragraph here', 'elementor' alias='text', 'content'; tag:String_Prop_Type default='p'; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type='e-self-hosted-video'` — esc_html__( 'Video', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-self-hosted-video/atomic-self-hosted-video.php`; class `Atomic_Self_Hosted_Video`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; source:Video_Src_Prop_Type alias='video', 'src'; autoplay:Boolean_Prop_Type default=false; playsinline:Boolean_Prop_Type default=false; mute:Boolean_Prop_Type default=false; loop:Boolean_Prop_Type default=false; controls:Boolean_Prop_Type default=true; preload:String_Prop_Type default='metadata'; download:Boolean_Prop_Type default=false; start_time:Number_Prop_Type default=null; end_time:Number_Prop_Type default=null; poster_enabled:Boolean_Prop_Type default=false; poster:Image_Prop_Type; attributes:Attributes_Prop_Type; base:Style_Definition.

### `get_element_type='e-svg'` — esc_html__( 'SVG', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-svg/atomic-svg.php`; class `Atomic_Svg`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type='e-tab'` — esc_html__( 'Tab trigger', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-tabs/atomic-tab/atomic-tab.php`; class `Atomic_Tab`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-tab-content'` — esc_html__( 'Tab content', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-tabs/atomic-tab-content/atomic-tab-content.php`; class `Atomic_Tab_Content`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-tabs'` — esc_html__( 'Tabs', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-tabs/atomic-tabs/atomic-tabs.php`; class `Atomic_Tabs`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-tabs-content-area'` — esc_html__( 'Tabs content area', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-tabs/atomic-tabs-content-area/atomic-tabs-content-area.php`; class `Atomic_Tabs_Content_Area`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-tabs-menu'` — esc_html__( 'Tabs menu', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-tabs/atomic-tabs-menu/atomic-tabs-menu.php`; class `Atomic_Tabs_Menu`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; attributes:Attributes_Prop_Type.

### `get_element_type='e-youtube'` — esc_html__( 'YouTube', 'elementor' )
- Source: `modules/atomic-widgets/elements/atomic-youtube/atomic-youtube.php`; class `Atomic_Youtube`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; source:String_Prop_Type default='https://www.youtube.com/watch?v=XHOmBV4js_E' alias='url', 'video'; start:String_Prop_Type; end:String_Prop_Type; autoplay:Boolean_Prop_Type default=false; mute:Boolean_Prop_Type default=false; loop:Boolean_Prop_Type default=false; lazyload:Boolean_Prop_Type default=false; player_controls:Boolean_Prop_Type default=true; captions:Boolean_Prop_Type default=false; privacy_mode:Boolean_Prop_Type default=false; rel:Boolean_Prop_Type default=true; attributes:Attributes_Prop_Type; base:Style_Definition.

### `(inherited/dynamic)` — title inherited
- Source: `modules/atomic-widgets/elements/base/atomic-element-base.php`; class `Atomic_Element_Base`.

### `(inherited/dynamic)` — title inherited
- Source: `modules/atomic-widgets/elements/base/atomic-widget-base.php`; class `Atomic_Widget_Base`.

### `get_element_type='e-div-block'` — esc_html__( 'Div block', 'elementor' )
- Source: `modules/atomic-widgets/elements/div-block/div-block.php`; class `Div_Block`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type='e-flexbox'` — esc_html__( 'Flexbox', 'elementor' )
- Source: `modules/atomic-widgets/elements/flexbox/flexbox.php`; class `Flexbox`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `get_element_type='e-grid'` — esc_html__( 'Grid', 'elementor' )
- Source: `modules/atomic-widgets/elements/grid/grid.php`; class `Grid`.
- Atomic prop schema candidates: classes:Classes_Prop_Type default=[]; link:Link_Prop_Type; attributes:Attributes_Prop_Type.

### `(inherited/dynamic)` — title inherited
- Source: `modules/atomic-widgets/elements/promotions/preserved-element.php`; class `Preserved_Element`.

### `get_element_type=Component_Instance_Prop_Type::WIDGET_TYPE` — esc_html__( 'Component', 'elementor' )
- Source: `modules/components/widgets/component-instance.php`; class `Component_Instance`.
- Atomic prop schema candidates: component_instance:Component_Instance_Prop_Type.

### `'contact-buttons'` — esc_html__( 'Single Chat', 'elementor' )
- Source: `modules/floating-buttons/widgets/contact-buttons.php`; class `Contact_Buttons`.

### `'floating-bars-var-1'` — esc_html__( 'Floating Bar CTA', 'elementor' )
- Source: `modules/floating-buttons/widgets/floating-bars-var-1.php`; class `Floating_Bars_Var_1`.

### `'link-in-bio'` — esc_html__( 'Minimalist', 'elementor' )
- Source: `modules/link-in-bio/widgets/link-in-bio.php`; class `Link_In_Bio`.

### `'nested-accordion'` — esc_html__( 'Accordion', 'elementor' )
- Source: `modules/nested-accordion/widgets/nested-accordion.php`; class `Nested_Accordion`.
- Legacy-style control sections: 'section_items', 'section_interactions', 'section_accordion_style', 'section_content_style', 'section_header_style'.
- Control declarations: 'items' [Control_Nested_Repeater::CONTROL_TYPE], 'heading_accordion_item_title_icon' [Controls_Manager::HEADING], 'accordion_item_title_icon' [Controls_Manager::ICONS], 'accordion_item_title_icon_active' [Controls_Manager::ICONS], 'title_tag' [Controls_Manager::SELECT], 'faq_schema' [Controls_Manager::SWITCHER], 'faq_schema_message' [Controls_Manager::ALERT], 'default_state' [Controls_Manager::SELECT], 'max_items_expended' [Controls_Manager::SELECT], 'n_accordion_animation_duration' [Controls_Manager::SLIDER], 'heading_header_style_title' [Controls_Manager::HEADING], 'heading_icon_style_title' [Controls_Manager::HEADING], $state . '_' . $context . '_color' [Controls_Manager::COLOR], 'accordion_item_title_position_horizontal' [Controls_Manager::CHOOSE], 'accordion_item_title_icon_position' [Controls_Manager::CHOOSE], 'accordion_item_title_space_between' [Controls_Manager::SLIDER], 'accordion_item_title_distance_from_content' [Controls_Manager::SLIDER], 'accordion_border_radius' [Controls_Manager::DIMENSIONS], 'accordion_padding' [Controls_Manager::DIMENSIONS], 'content_border_radius' [Controls_Manager::DIMENSIONS], 'content_padding' [Controls_Manager::DIMENSIONS], 'icon_size' [Controls_Manager::SLIDER], 'icon_spacing' [Controls_Manager::SLIDER], Group_Control_Background::get_type() (name=content_background), Group_Control_Border::get_type() (name=content_border), Group_Control_Typography::get_type() (name=title_typography), Group_Control_Text_Shadow::get_type(), Group_Control_Text_Stroke::get_type(), Group_Control_Background::get_type() (name=accordion_background_), Group_Control_Border::get_type() (name=accordion_border_).

### `'nested-tabs'` — esc_html__( 'Tabs', 'elementor' )
- Source: `modules/nested-tabs/widgets/nested-tabs.php`; class `NestedTabs`.
- Legacy-style control sections: 'section_tabs', 'section_tabs_responsive', 'section_tabs_style', 'section_title_style', 'icon_section_style', 'section_box_style'.
- Control declarations: 'tabs' [Control_Nested_Repeater::CONTROL_TYPE], 'breakpoint_selector' [Controls_Manager::SELECT], 'hover_animation' [Controls_Manager::HOVER_ANIMATION], 'tabs_title_transition_duration' [Controls_Manager::SLIDER], 'title_text_color' [Controls_Manager::COLOR], 'title_text_color_hover' [Controls_Manager::COLOR], 'title_text_color_active' [Controls_Manager::COLOR], 'icon_color' [Controls_Manager::COLOR], 'icon_color_hover' [Controls_Manager::COLOR], 'icon_color_active' [Controls_Manager::COLOR], 'tabs_direction' [Controls_Manager::CHOOSE], 'tabs_justify_horizontal' [Controls_Manager::CHOOSE], 'tabs_justify_vertical' [Controls_Manager::CHOOSE], 'tabs_width' [Controls_Manager::SLIDER], 'title_alignment' [Controls_Manager::CHOOSE], 'horizontal_scroll' [Controls_Manager::SELECT], 'tabs_title_space_between' [Controls_Manager::SLIDER], 'tabs_title_spacing' [Controls_Manager::SLIDER], 'tabs_title_border_radius' [Controls_Manager::DIMENSIONS], 'padding' [Controls_Manager::DIMENSIONS], 'icon_position' [Controls_Manager::CHOOSE], 'icon_size' [Controls_Manager::SLIDER], 'icon_spacing' [Controls_Manager::SLIDER], 'box_border_radius' [Controls_Manager::DIMENSIONS], 'box_padding' [Controls_Manager::DIMENSIONS], Group_Control_Background::get_type() (name=tabs_title_background_color), Group_Control_Border::get_type() (name=tabs_title_border), Group_Control_Box_Shadow::get_type() (name=tabs_title_box_shadow), Group_Control_Background::get_type() (name=tabs_title_background_color_hover), Group_Control_Border::get_type() (name=tabs_title_border_hover), Group_Control_Box_Shadow::get_type() (name=tabs_title_box_shadow_hover), Group_Control_Background::get_type() (name=tabs_title_background_color_active), Group_Control_Border::get_type() (name=tabs_title_border_active), Group_Control_Box_Shadow::get_type() (name=tabs_title_box_shadow_active), Group_Control_Typography::get_type() (name=title_typography), Group_Control_Text_Shadow::get_type() (name=title_text_shadow), Group_Control_Text_Stroke::get_type() (name=title_text_stroke), Group_Control_Text_Shadow::get_type() (name=title_text_shadow_hover), Group_Control_Text_Stroke::get_type() (name=title_text_stroke_hover), Group_Control_Text_Shadow::get_type() (name=title_text_shadow_active), Group_Control_Text_Stroke::get_type() (name=title_text_stroke_active), Group_Control_Background::get_type() (name=box_background_color), Group_Control_Border::get_type() (name=box_border), Group_Control_Box_Shadow::get_type() (name=box_shadow_box_shadow).

### `$this->widget_data['widget_name']` — $this->widget_data['widget_title']
- Source: `modules/promotions/widgets/pro-widget-promotion.php`; class `Pro_Widget_Promotion`.

### `'text-path'` — esc_html__( 'Text Path', 'elementor' )
- Source: `modules/shapes/widgets/text-path.php`; class `TextPath`.
- Legacy-style control sections: 'section_content_text_path', 'section_style_text_path', 'section_style_path'.
- Control declarations: 'text' [Controls_Manager::TEXT], 'path' [Controls_Manager::SELECT], 'custom_path' [Controls_Manager::MEDIA], 'link' [Controls_Manager::URL], 'text_path_direction' [Controls_Manager::SELECT], 'show_path' [Controls_Manager::SWITCHER], 'text_heading' [Controls_Manager::HEADING], 'start_point' [Controls_Manager::SLIDER], 'text_color_normal' [Controls_Manager::COLOR], 'text_color_hover' [Controls_Manager::COLOR], 'hover_animation' [Controls_Manager::HOVER_ANIMATION], 'hover_transition' [Controls_Manager::SLIDER], 'path_fill_normal' [Controls_Manager::COLOR], 'stroke_heading_normal' [Controls_Manager::HEADING], 'stroke_color_normal' [Controls_Manager::COLOR], 'stroke_width_normal' [Controls_Manager::SLIDER], 'path_fill_hover' [Controls_Manager::COLOR], 'stroke_heading_hover' [Controls_Manager::HEADING], 'stroke_color_hover' [Controls_Manager::COLOR], 'stroke_width_hover' [Controls_Manager::SLIDER], 'stroke_transition' [Controls_Manager::SLIDER], 'align' [Controls_Manager::CHOOSE], 'size' [Controls_Manager::SLIDER], 'rotation' [Controls_Manager::SLIDER], 'word_spacing' [Controls_Manager::SLIDER], Group_Control_Typography::get_type() (name=text_typography), Group_Control_Text_Stroke::get_type() (name=text_stroke).

## Base layout elements

### `container` (`includes/elements/container.php`)
- Control sections: 'section_layout_container', 'section_layout_additional_options', 'section_background', 'section_background_overlay', 'section_border', 'section_shape_divider', 'section_layout', 'section_effects', '_section_responsive'.
- Control declarations found in file: 'container_type' [Controls_Manager::SELECT], 'content_width' [Controls_Manager::SELECT], 'overflow' [Controls_Manager::SELECT], 'html_tag' [Controls_Manager::SELECT], 'link_note' [Controls_Manager::ALERT], 'link' [Controls_Manager::URL], 'handle_slideshow_asset_loading' [Controls_Manager::HIDDEN], 'background_hover_transition' [Controls_Manager::SLIDER], 'overlay_blend_mode' [Controls_Manager::SELECT], 'background_overlay_hover_transition' [Controls_Manager::SLIDER], 'border_hover_transition' [Controls_Manager::SLIDER], $base_control_key [Controls_Manager::VISUAL_CHOICE], $base_control_key . '_color' [Controls_Manager::COLOR], $base_control_key . '_flip' [Controls_Manager::SWITCHER], $base_control_key . '_negative' [Controls_Manager::SWITCHER], $base_control_key . '_above_content' [Controls_Manager::SWITCHER], 'heading_grid_item' [Controls_Manager::HEADING], 'position_description' [Controls_Manager::ALERT], 'position' [Controls_Manager::SELECT], '_offset_orientation_h' [Controls_Manager::CHOOSE], '_offset_orientation_v' [Controls_Manager::CHOOSE], '_element_id' [Controls_Manager::TEXT], 'css_classes' [Controls_Manager::TEXT], 'animation_duration' [Controls_Manager::SELECT], 'animation_delay' [Controls_Manager::NUMBER], 'heading_visibility' [Controls_Manager::HEADING], 'responsive_description' [Controls_Manager::RAW_HTML], 'width', 'boxed_width', 'min_height' [Controls_Manager::SLIDER], 'background_overlay_opacity' [Controls_Manager::SLIDER], 'background_overlay_hover_opacity' [Controls_Manager::SLIDER], 'border_radius' [Controls_Manager::DIMENSIONS], 'border_radius_hover' [Controls_Manager::DIMENSIONS], $base_control_key . '_width' [Controls_Manager::SLIDER], $base_control_key . '_height' [Controls_Manager::SLIDER], 'margin' [Controls_Manager::DIMENSIONS], 'padding' [Controls_Manager::DIMENSIONS], 'grid_column' [Controls_Manager::SELECT], 'grid_column_custom' [Controls_Manager::TEXT], 'grid_row' [Controls_Manager::SELECT], 'grid_row_custom' [Controls_Manager::TEXT], '_offset_x' [Controls_Manager::SLIDER], '_offset_x_end' [Controls_Manager::SLIDER], '_offset_y' [Controls_Manager::SLIDER], '_offset_y_end' [Controls_Manager::SLIDER], 'z_index' [Controls_Manager::NUMBER], 'animation' [Controls_Manager::ANIMATION], Group_Control_Flex_Container::get_type() (name=flex) [group], Group_Control_Grid_Container::get_type() (name=grid) [group], Group_Control_Background::get_type() (name=background) [group], Group_Control_Background::get_type() (name=background_hover) [group], Group_Control_Background::get_type() (name=background_overlay) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Background::get_type() (name=background_overlay_hover) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group], Group_Control_Border::get_type() (name=border) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow) [group], Group_Control_Border::get_type() (name=border_hover) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow_hover) [group], Group_Control_Flex_Item::get_type() (name=_flex) [group].

### `section` (`includes/elements/section.php`)
- Control sections: 'section_layout', 'section_structure', 'section_background', 'section_background_overlay', 'section_border', 'section_shape_divider', 'section_typo', 'section_advanced', 'section_effects', '_section_responsive'.
- Control declarations found in file: '_title' [Controls_Manager::HIDDEN], 'layout' [Controls_Manager::SELECT], 'gap' [Controls_Manager::SELECT], 'height' [Controls_Manager::SELECT], 'height_inner' [Controls_Manager::SELECT], 'column_position' [Controls_Manager::SELECT], 'content_position' [Controls_Manager::SELECT], 'overflow' [Controls_Manager::SELECT], 'stretch_section' [Controls_Manager::SWITCHER], 'html_tag' [Controls_Manager::SELECT], 'structure' [Controls_Manager::STRUCTURE], 'handle_slideshow_asset_loading' [Controls_Manager::HIDDEN], 'background_hover_transition' [Controls_Manager::SLIDER], 'overlay_blend_mode' [Controls_Manager::SELECT], 'background_overlay_hover_transition' [Controls_Manager::SLIDER], 'border_hover_transition' [Controls_Manager::SLIDER], $base_control_key [Controls_Manager::VISUAL_CHOICE], $base_control_key . '_color' [Controls_Manager::COLOR], $base_control_key . '_flip' [Controls_Manager::SWITCHER], $base_control_key . '_negative' [Controls_Manager::SWITCHER], $base_control_key . '_above_content' [Controls_Manager::SWITCHER], 'heading_color' [Controls_Manager::COLOR], 'color_text' [Controls_Manager::COLOR], 'color_link' [Controls_Manager::COLOR], 'color_link_hover' [Controls_Manager::COLOR], '_element_id' [Controls_Manager::TEXT], 'css_classes' [Controls_Manager::TEXT], 'animation_duration' [Controls_Manager::SELECT], 'animation_delay' [Controls_Manager::NUMBER], 'reverse_order_' . $breakpoint_key [Controls_Manager::SWITCHER], 'heading_visibility' [Controls_Manager::HEADING], 'responsive_description' [Controls_Manager::RAW_HTML], 'content_width' [Controls_Manager::SLIDER], 'gap_columns_custom' [Controls_Manager::SLIDER], 'custom_height' [Controls_Manager::SLIDER], 'custom_height_inner' [Controls_Manager::SLIDER], 'background_overlay_opacity' [Controls_Manager::SLIDER], 'background_overlay_hover_opacity' [Controls_Manager::SLIDER], 'border_radius' [Controls_Manager::DIMENSIONS], 'border_radius_hover' [Controls_Manager::DIMENSIONS], $base_control_key . '_width' [Controls_Manager::SLIDER], $base_control_key . '_height' [Controls_Manager::SLIDER], 'text_align' [Controls_Manager::CHOOSE], 'margin' [Controls_Manager::DIMENSIONS], 'padding' [Controls_Manager::DIMENSIONS], 'z_index' [Controls_Manager::NUMBER], 'animation' [Controls_Manager::ANIMATION], Group_Control_Background::get_type() (name=background) [group], Group_Control_Background::get_type() (name=background_hover) [group], Group_Control_Background::get_type() (name=background_overlay) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Background::get_type() (name=background_overlay_hover) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group], Group_Control_Border::get_type() (name=border) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow) [group], Group_Control_Border::get_type() (name=border_hover) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow_hover) [group].

### `column` (`includes/elements/column.php`)
- Control sections: 'layout', 'section_style', 'section_background_overlay', 'section_border', 'section_typo', 'section_advanced', 'section_effects', '_section_responsive'.
- Control declarations found in file: '_title' [Controls_Manager::HIDDEN], 'html_tag' [Controls_Manager::SELECT], 'handle_slideshow_asset_loading' [Controls_Manager::HIDDEN], 'background_hover_transition' [Controls_Manager::SLIDER], 'overlay_blend_mode' [Controls_Manager::SELECT], 'background_overlay_hover_transition' [Controls_Manager::SLIDER], 'border_hover_transition' [Controls_Manager::SLIDER], 'heading_color' [Controls_Manager::COLOR], 'color_text' [Controls_Manager::COLOR], 'color_link' [Controls_Manager::COLOR], 'color_link_hover' [Controls_Manager::COLOR], '_element_id' [Controls_Manager::TEXT], 'css_classes' [Controls_Manager::TEXT], 'screen_sm' [Controls_Manager::HIDDEN], 'screen_sm_width' [Controls_Manager::HIDDEN], 'animation_duration' [Controls_Manager::SELECT], 'animation_delay' [Controls_Manager::NUMBER], 'responsive_description' [Controls_Manager::RAW_HTML], '_inline_size' [Controls_Manager::NUMBER], 'content_position' [Controls_Manager::SELECT], 'align' [Controls_Manager::SELECT], 'space_between_widgets' [Controls_Manager::NUMBER], 'background_overlay_opacity' [Controls_Manager::SLIDER], 'background_overlay_hover_opacity' [Controls_Manager::SLIDER], 'border_radius' [Controls_Manager::DIMENSIONS], 'border_radius_hover' [Controls_Manager::DIMENSIONS], 'text_align' [Controls_Manager::CHOOSE], 'margin' [Controls_Manager::DIMENSIONS], 'padding' [Controls_Manager::DIMENSIONS], 'z_index' [Controls_Manager::NUMBER], 'animation' [Controls_Manager::ANIMATION], Group_Control_Background::get_type() (name=background) [group], Group_Control_Background::get_type() (name=background_hover) [group], Group_Control_Background::get_type() (name=background_overlay) [group], Group_Control_Css_Filter::get_type() (name=css_filters) [group], Group_Control_Background::get_type() (name=background_overlay_hover) [group], Group_Control_Css_Filter::get_type() (name=css_filters_hover) [group], Group_Control_Border::get_type() (name=border) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow) [group], Group_Control_Border::get_type() (name=border_hover) [group], Group_Control_Box_Shadow::get_type() (name=box_shadow_hover) [group].

## Important shared settings/control sources

- `includes/widgets/common-base.php` and `common-optimized.php`: cross-widget layout/style controls, including `_margin`, `_padding`, `_element_width`, custom width, grid placement, flex item, position/offset, z-index, CSS ID/classes, animation, background, border, radius, box shadow, mask, and responsive descriptions. Which controls apply can depend on optimized-markup/experiment settings.
- `includes/widgets/traits/button-trait.php`: shared button content/style controls and generated setting keys used by the classic Button widget and other consumers.
- `includes/base/controls-stack.php`: registration, defaults, sanitization, dynamic tags and control lookup; settings values are control-driven.
- `includes/controls/groups/`: group controls such as typography, background, border, shadow, image size, CSS filters; group controls generate multiple settings keys from their group name.
- `includes/base/element-base.php` and `includes/base/widget-base.php`: raw/save node serialization and widget-specific `widgetType` behavior.
- `core/base/document.php`: `_elementor_data` storage retrieval, document content, export/import transformations, and `content`/`settings`/`metadata` document export wrapper.
- `app/modules/import-export/runners/export/elementor-content.php` and corresponding import runner: site-wide content import/export packaging, distinct from a single `_elementor_data` tree.

## Scope and runtime caveats

- The archive contains Elementor Core source 4.3.5. Elementor Pro widget source is not equivalent to the promotion placeholders in this archive; a Pro widget requires its own installed implementation and its own controls/schema.
- The active set of widgets can differ at runtime because plugins register widgets via `elementor/widgets/register`, WordPress widgets are bridged as `wp-widget-{id_base}`, and some modules/widgets are controlled by experiments or Pro availability.
- Control ID extraction in this reference is source-static, so inherited traits, dynamic injected controls, group-control-generated fields, nested repeater controls, and runtime extensions must be traced to their defining source before mapping a particular setting. Never infer a field just from its display label.
- This is an index/reference for source reading, not a substitute for validating generated JSON against an actual Elementor site/version.