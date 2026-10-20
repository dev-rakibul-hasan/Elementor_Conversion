/**
 * Elementor Module — Widget Registry
 * 
 * Manages Elementor widget definitions, actual control IDs, Core vs Pro status,
 * runtime directory profile loading, and profile validation.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  WidgetProfile,
  ControlDef,
  WidgetRegistry,
} from './types.js';

// ─── Standard Typography Controls ───────────────────────────────────────────

const TYPOGRAPHY_CONTROLS: ControlDef[] = [
  { id: 'typography_typography', type: 'select', default: 'custom', label: 'Typography Type', options: { default: 'Default', custom: 'Custom' } },
  { id: 'typography_font_family', type: 'text', label: 'Font Family' },
  { id: 'typography_font_size', type: 'slider', responsive: true, label: 'Font Size', default: { unit: 'px', size: 16 } },
  { id: 'typography_font_size_tablet', type: 'slider', responsive: true, label: 'Font Size (Tablet)' },
  { id: 'typography_font_size_mobile', type: 'slider', responsive: true, label: 'Font Size (Mobile)' },
  { id: 'typography_font_weight', type: 'select', label: 'Font Weight', default: 'normal' },
  { id: 'typography_text_transform', type: 'select', label: 'Transform', default: 'none' },
  { id: 'typography_font_style', type: 'select', label: 'Style', default: 'normal' },
  { id: 'typography_text_decoration', type: 'select', label: 'Decoration', default: 'none' },
  { id: 'typography_line_height', type: 'slider', responsive: true, label: 'Line Height' },
  { id: 'typography_line_height_tablet', type: 'slider', responsive: true, label: 'Line Height (Tablet)' },
  { id: 'typography_line_height_mobile', type: 'slider', responsive: true, label: 'Line Height (Mobile)' },
  { id: 'typography_letter_spacing', type: 'slider', responsive: true, label: 'Letter Spacing' },
  { id: 'typography_letter_spacing_tablet', type: 'slider', responsive: true, label: 'Letter Spacing (Tablet)' },
  { id: 'typography_letter_spacing_mobile', type: 'slider', responsive: true, label: 'Letter Spacing (Mobile)' },
  { id: 'typography_word_spacing', type: 'slider', responsive: true, label: 'Word Spacing' },
];

// ─── Core Elementor Widget Profiles ──────────────────────────────────────────

export const BUILT_IN_CORE_WIDGETS: WidgetProfile[] = [
  // 1. Heading
  {
    slug: 'heading',
    name: 'Heading',
    category: 'basic',
    supportedInCore: true,
    description: 'Header text widget supporting h1-h6 tags, typography, and alignment.',
    defaults: {
      title: 'This is a heading',
      header_size: 'h2',
      align: 'left',
    },
    controls: [
      { id: 'title', type: 'textarea', default: 'This is a heading', label: 'Title' },
      { id: 'link', type: 'text', label: 'Link' },
      { id: 'size', type: 'select', default: 'default', label: 'Size', options: { default: 'Default', small: 'Small', medium: 'Medium', large: 'Large', xl: 'XL', xxl: 'XXL' } },
      { id: 'header_size', type: 'select', default: 'h2', label: 'HTML Tag', options: { h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6', div: 'div', span: 'span', p: 'p' } },
      { id: 'align', type: 'choose', default: 'left', responsive: true, label: 'Alignment' },
      { id: 'title_color', type: 'color', label: 'Text Color' },
      { id: 'text_color', type: 'color', label: 'Alternative Text Color' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 2. Text Editor
  {
    slug: 'text-editor',
    name: 'Text Editor',
    category: 'basic',
    supportedInCore: true,
    description: 'Rich text WYSIWYG paragraph content block.',
    defaults: {
      editor: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>',
      align: 'left',
    },
    controls: [
      { id: 'editor', type: 'wysiwyg', default: '', label: 'Content' },
      { id: 'align', type: 'choose', default: 'left', responsive: true, label: 'Alignment' },
      { id: 'text_color', type: 'color', label: 'Text Color' },
      { id: 'drop_cap', type: 'switcher', default: '', label: 'Drop Cap' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 3. Image
  {
    slug: 'image',
    name: 'Image',
    category: 'basic',
    supportedInCore: true,
    description: 'Media image renderer with sizing, captions, links, and borders.',
    defaults: {
      image: { url: '', id: '' },
      image_size: 'full',
      align: 'center',
      caption_source: 'none',
      link_to: 'none',
    },
    controls: [
      { id: 'image', type: 'media', default: { url: '', id: '' }, label: 'Choose Image' },
      { id: 'image_size', type: 'select', default: 'full', label: 'Image Size' },
      { id: 'align', type: 'choose', default: 'center', responsive: true, label: 'Alignment' },
      { id: 'caption_source', type: 'select', default: 'none', label: 'Caption' },
      { id: 'caption', type: 'text', label: 'Custom Caption' },
      { id: 'link_to', type: 'select', default: 'none', label: 'Link To' },
      { id: 'link', type: 'text', label: 'Link' },
      { id: 'width', type: 'slider', responsive: true, label: 'Width' },
      { id: 'space', type: 'slider', responsive: true, label: 'Max Width' },
      { id: 'opacity', type: 'slider', label: 'Opacity' },
      { id: 'border_border', type: 'select', label: 'Border' },
      { id: 'border_width', type: 'dimensions', responsive: true, label: 'Border Width' },
      { id: 'border_color', type: 'color', label: 'Border Color' },
      { id: 'border_radius', type: 'dimensions', responsive: true, label: 'Border Radius' },
    ],
  },

  // 4. Button
  {
    slug: 'button',
    name: 'Button',
    category: 'basic',
    supportedInCore: true,
    description: 'Interactive button with link, icons, typography, and hover styles.',
    defaults: {
      text: 'Click here',
      link: { url: '#', is_external: false, nofollow: false },
      size: 'md',
      align: 'left',
      button_type: 'default',
    },
    controls: [
      { id: 'button_type', type: 'select', default: 'default', label: 'Type' },
      { id: 'text', type: 'text', default: 'Click here', label: 'Text' },
      { id: 'link', type: 'text', default: { url: '#' }, label: 'Link' },
      { id: 'align', type: 'choose', default: 'left', responsive: true, label: 'Alignment' },
      { id: 'size', type: 'select', default: 'md', label: 'Size', options: { xs: 'Extra Small', sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' } },
      { id: 'selected_icon', type: 'icons', label: 'Icon' },
      { id: 'icon_align', type: 'select', default: 'left', label: 'Icon Position', options: { left: 'Before', right: 'After' } },
      { id: 'icon_indent', type: 'slider', responsive: true, label: 'Icon Spacing' },
      { id: 'button_text_color', type: 'color', label: 'Text Color' },
      { id: 'text_color', type: 'color', label: 'Alternative Text Color' },
      { id: 'background_color', type: 'color', label: 'Background Color' },
      { id: 'border_radius', type: 'dimensions', responsive: true, label: 'Border Radius' },
      { id: 'button_padding', type: 'dimensions', responsive: true, label: 'Padding' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 5. Icon
  {
    slug: 'icon',
    name: 'Icon',
    category: 'basic',
    supportedInCore: true,
    description: 'Standalone vector glyph icon element.',
    defaults: {
      selected_icon: { value: 'fas fa-star', library: 'fa-solid' },
      view: 'default',
      shape: 'circle',
      align: 'center',
    },
    controls: [
      { id: 'selected_icon', type: 'icons', default: { value: 'fas fa-star', library: 'fa-solid' }, label: 'Icon' },
      { id: 'view', type: 'select', default: 'default', label: 'View', options: { default: 'Default', stacked: 'Stacked', framed: 'Framed' } },
      { id: 'shape', type: 'select', default: 'circle', label: 'Shape', options: { circle: 'Circle', square: 'Square' } },
      { id: 'link', type: 'text', label: 'Link' },
      { id: 'align', type: 'choose', default: 'center', responsive: true, label: 'Alignment' },
      { id: 'primary_color', type: 'color', label: 'Primary Color' },
      { id: 'icon_color', type: 'color', label: 'Icon Color' },
      { id: 'secondary_color', type: 'color', label: 'Secondary Color' },
      { id: 'size', type: 'slider', responsive: true, label: 'Size' },
      { id: 'icon_size', type: 'slider', responsive: true, label: 'Icon Size' },
      { id: 'rotate', type: 'slider', label: 'Rotate' },
    ],
  },

  // 6. Icon Box
  {
    slug: 'icon-box',
    name: 'Icon Box',
    category: 'general',
    supportedInCore: true,
    description: 'Composite card containing icon, headline, description, and link.',
    defaults: {
      selected_icon: { value: 'fas fa-star', library: 'fa-solid' },
      title_text: 'This is the heading',
      description_text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      position: 'top',
      title_size: 'h3',
    },
    controls: [
      { id: 'selected_icon', type: 'icons', default: { value: 'fas fa-star', library: 'fa-solid' }, label: 'Icon' },
      { id: 'view', type: 'select', default: 'default', label: 'View' },
      { id: 'title_text', type: 'text', default: 'This is the heading', label: 'Title & Description' },
      { id: 'description_text', type: 'textarea', default: '', label: 'Description' },
      { id: 'link', type: 'text', label: 'Link' },
      { id: 'position', type: 'choose', default: 'top', responsive: true, label: 'Icon Position', options: { left: 'Left', top: 'Top', right: 'Right' } },
      { id: 'title_size', type: 'select', default: 'h3', label: 'Title Tag' },
      { id: 'icon_color', type: 'color', label: 'Icon Color' },
      { id: 'title_color', type: 'color', label: 'Title Color' },
      { id: 'description_color', type: 'color', label: 'Description Color' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 7. Icon List
  {
    slug: 'icon-list',
    name: 'Icon List',
    category: 'general',
    supportedInCore: true,
    description: 'Vertical or horizontal list of items with icons.',
    defaults: {
      icon_list: [
        { text: 'List Item #1', selected_icon: { value: 'fas fa-check', library: 'fa-solid' } },
        { text: 'List Item #2', selected_icon: { value: 'fas fa-check', library: 'fa-solid' } },
      ],
      layout: 'traditional',
    },
    controls: [
      {
        id: 'icon_list',
        type: 'repeater',
        label: 'Items',
        fields: [
          { id: 'text', type: 'text', default: 'List Item', label: 'Text' },
          { id: 'selected_icon', type: 'icons', default: { value: 'fas fa-check', library: 'fa-solid' }, label: 'Icon' },
          { id: 'link', type: 'text', label: 'Link' },
        ],
      },
      { id: 'layout', type: 'choose', default: 'traditional', responsive: true, label: 'Layout', options: { traditional: 'Default', inline: 'Inline' } },
      { id: 'space_between', type: 'slider', responsive: true, label: 'Space Between' },
      { id: 'icon_color', type: 'color', label: 'Icon Color' },
      { id: 'text_color', type: 'color', label: 'Text Color' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 8. Image Box
  {
    slug: 'image-box',
    name: 'Image Box',
    category: 'general',
    supportedInCore: true,
    description: 'Card with image header, title, description, and link.',
    defaults: {
      image: { url: '', id: '' },
      title_text: 'This is the heading',
      description_text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      position: 'top',
      title_size: 'h3',
    },
    controls: [
      { id: 'image', type: 'media', default: { url: '', id: '' }, label: 'Choose Image' },
      { id: 'title_text', type: 'text', default: 'This is the heading', label: 'Title & Description' },
      { id: 'description_text', type: 'textarea', default: '', label: 'Description' },
      { id: 'link', type: 'text', label: 'Link' },
      { id: 'position', type: 'choose', default: 'top', responsive: true, label: 'Image Position', options: { left: 'Left', top: 'Top', right: 'Right' } },
      { id: 'title_size', type: 'select', default: 'h3', label: 'Title Tag' },
      { id: 'image_size', type: 'select', default: 'full', label: 'Image Size' },
      { id: 'title_color', type: 'color', label: 'Title Color' },
      { id: 'description_color', type: 'color', label: 'Description Color' },
    ],
  },

  // 9. Star Rating
  {
    slug: 'star-rating',
    name: 'Star Rating',
    category: 'general',
    supportedInCore: true,
    description: 'Star rating metric display with customizable scale and styling.',
    defaults: {
      rating_scale: '5',
      rating_value: 5,
      rating: 5,
      star_style: 'font_awesome',
      title: '',
    },
    controls: [
      { id: 'rating_scale', type: 'select', default: '5', label: 'Rating Scale', options: { '5': '0-5', '10': '0-10' } },
      { id: 'rating_value', type: 'number', default: 5, label: 'Rating Value' },
      { id: 'rating', type: 'number', default: 5, label: 'Rating' },
      { id: 'star_style', type: 'select', default: 'font_awesome', label: 'Star Style' },
      { id: 'title', type: 'text', default: '', label: 'Title' },
      { id: 'align', type: 'choose', default: 'left', responsive: true, label: 'Alignment' },
      { id: 'star_color', type: 'color', label: 'Star Color' },
      { id: 'unfilled_star_color', type: 'color', label: 'Unmarked Color' },
      { id: 'star_size', type: 'slider', responsive: true, label: 'Size' },
    ],
  },

  // 10. Counter
  {
    slug: 'counter',
    name: 'Counter',
    category: 'general',
    supportedInCore: true,
    description: 'Animated number KPI counter with prefix, suffix, and title.',
    defaults: {
      starting_number: 0,
      ending_number: 100,
      duration: 2000,
      thousand_separator: true,
      prefix: '',
      suffix: '',
      title: 'Cool Number',
    },
    controls: [
      { id: 'starting_number', type: 'number', default: 0, label: 'Starting Number' },
      { id: 'ending_number', type: 'number', default: 100, label: 'Ending Number' },
      { id: 'prefix', type: 'text', default: '', label: 'Number Prefix' },
      { id: 'suffix', type: 'text', default: '', label: 'Number Suffix' },
      { id: 'duration', type: 'number', default: 2000, label: 'Animation Duration' },
      { id: 'thousand_separator', type: 'switcher', default: 'yes', label: 'Thousand Separator' },
      { id: 'title', type: 'text', default: 'Cool Number', label: 'Title' },
      { id: 'number_color', type: 'color', label: 'Number Color' },
      { id: 'title_color', type: 'color', label: 'Title Color' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 11. Progress
  {
    slug: 'progress',
    name: 'Progress Bar',
    category: 'general',
    supportedInCore: true,
    description: 'Visual progress metric bar with inner title and percentage label.',
    defaults: {
      title: 'My Skill',
      percent: { unit: '%', size: 50 },
      display_percentage: 'show',
      inner_text: '',
      progress_type: 'primary',
    },
    controls: [
      { id: 'title', type: 'text', default: 'My Skill', label: 'Title' },
      { id: 'progress_type', type: 'select', default: 'primary', label: 'Type' },
      { id: 'percent', type: 'slider', default: { unit: '%', size: 50 }, label: 'Percentage' },
      { id: 'display_percentage', type: 'select', default: 'show', label: 'Display Percentage' },
      { id: 'inner_text', type: 'text', default: '', label: 'Inner Text' },
      { id: 'bar_color', type: 'color', label: 'Color' },
      { id: 'bar_bg_color', type: 'color', label: 'Background Color' },
      { id: 'bar_height', type: 'slider', responsive: true, label: 'Height' },
    ],
  },

  // 12. Divider
  {
    slug: 'divider',
    name: 'Divider',
    category: 'basic',
    supportedInCore: true,
    description: 'Horizontal separator rule with width, alignment, and styling controls.',
    defaults: {
      style: 'solid',
      weight: { unit: 'px', size: 1 },
      width: { unit: '%', size: 100 },
      gap: { unit: 'px', size: 15 },
      color: '#000000',
    },
    controls: [
      { id: 'style', type: 'select', default: 'solid', label: 'Style', options: { solid: 'Solid', double: 'Double', dotted: 'Dotted', dashed: 'Dashed' } },
      { id: 'weight', type: 'slider', default: { unit: 'px', size: 1 }, label: 'Weight' },
      { id: 'width', type: 'slider', default: { unit: '%', size: 100 }, responsive: true, label: 'Width' },
      { id: 'align', type: 'choose', default: 'center', responsive: true, label: 'Alignment' },
      { id: 'gap', type: 'slider', default: { unit: 'px', size: 15 }, responsive: true, label: 'Gap' },
      { id: 'color', type: 'color', label: 'Color' },
    ],
  },

  // 13. Spacer
  {
    slug: 'spacer',
    name: 'Spacer',
    category: 'basic',
    supportedInCore: true,
    description: 'Adjustable blank vertical spacing block.',
    defaults: {
      space: { unit: 'px', size: 50 },
    },
    controls: [
      { id: 'space', type: 'slider', default: { unit: 'px', size: 50 }, responsive: true, label: 'Space' },
    ],
  },

  // 14. Google Maps
  {
    slug: 'google_maps',
    name: 'Google Maps',
    category: 'basic',
    supportedInCore: true,
    description: 'Interactive embedded Google map by address location.',
    defaults: {
      address: 'London Eye, London, United Kingdom',
      zoom: { unit: 'px', size: 14 },
      height: { unit: 'px', size: 300 },
    },
    controls: [
      { id: 'address', type: 'text', default: 'London Eye, London, United Kingdom', label: 'Location' },
      { id: 'zoom', type: 'slider', default: { unit: 'px', size: 14 }, label: 'Zoom' },
      { id: 'height', type: 'slider', default: { unit: 'px', size: 300 }, responsive: true, label: 'Height' },
      { id: 'prevent_scroll', type: 'switcher', default: '', label: 'Prevent Scroll' },
    ],
  },

  // 15. Video
  {
    slug: 'video',
    name: 'Video',
    category: 'basic',
    supportedInCore: true,
    description: 'Video embed supporting YouTube, Vimeo, Dailymotion, or self-hosted media.',
    defaults: {
      video_type: 'youtube',
      youtube_url: 'https://www.youtube.com/watch?v=XHTrLYShBRQ',
      vimeo_url: '',
      hosted_url: '',
      autoplay: 'no',
      mute: 'no',
      loop: 'no',
      controls: 'yes',
    },
    controls: [
      { id: 'video_type', type: 'select', default: 'youtube', label: 'Source', options: { youtube: 'YouTube', vimeo: 'Vimeo', dailymotion: 'Dailymotion', hosted: 'Self Hosted' } },
      { id: 'youtube_url', type: 'text', label: 'Link' },
      { id: 'vimeo_url', type: 'text', label: 'Link' },
      { id: 'hosted_url', type: 'media', label: 'Choose Video' },
      { id: 'autoplay', type: 'switcher', default: 'no', label: 'Autoplay' },
      { id: 'mute', type: 'switcher', default: 'no', label: 'Mute' },
      { id: 'loop', type: 'switcher', default: 'no', label: 'Loop' },
      { id: 'controls', type: 'switcher', default: 'yes', label: 'Player Controls' },
      { id: 'aspect_ratio', type: 'select', default: '169', label: 'Aspect Ratio' },
    ],
  },

  // 16. Social Icons
  {
    slug: 'social-icons',
    name: 'Social Icons',
    category: 'general',
    supportedInCore: true,
    description: 'List of social profile links with brand icons.',
    defaults: {
      social_icon_list: [
        { social_icon: { value: 'fab fa-facebook', library: 'fa-brands' }, link: { url: 'https://facebook.com' } },
        { social_icon: { value: 'fab fa-twitter', library: 'fa-brands' }, link: { url: 'https://twitter.com' } },
        { social_icon: { value: 'fab fa-youtube', library: 'fa-brands' }, link: { url: 'https://youtube.com' } },
      ],
      shape: 'rounded',
      align: 'center',
    },
    controls: [
      {
        id: 'social_icon_list',
        type: 'repeater',
        label: 'Social Icons',
        fields: [
          { id: 'social_icon', type: 'icons', label: 'Icon' },
          { id: 'link', type: 'text', label: 'Link' },
        ],
      },
      { id: 'shape', type: 'select', default: 'rounded', label: 'Shape', options: { rounded: 'Rounded', square: 'Square', circle: 'Circle' } },
      { id: 'align', type: 'choose', default: 'center', responsive: true, label: 'Alignment' },
      { id: 'icon_size', type: 'slider', responsive: true, label: 'Size' },
      { id: 'icon_padding', type: 'slider', responsive: true, label: 'Padding' },
      { id: 'icon_spacing', type: 'slider', responsive: true, label: 'Spacing' },
    ],
  },

  // 17. Tabs
  {
    slug: 'tabs',
    name: 'Tabs',
    category: 'general',
    supportedInCore: true,
    description: 'Tabbed panel content switcher.',
    defaults: {
      tabs: [
        { tab_title: 'Tab #1', tab_content: '<p>Lorem ipsum dolor sit amet.</p>' },
        { tab_title: 'Tab #2', tab_content: '<p>Consectetur adipiscing elit.</p>' },
      ],
      type: 'horizontal',
    },
    controls: [
      {
        id: 'tabs',
        type: 'repeater',
        label: 'Tabs Items',
        fields: [
          { id: 'tab_title', type: 'text', default: 'Tab Title', label: 'Title' },
          { id: 'tab_content', type: 'wysiwyg', default: 'Tab Content', label: 'Content' },
        ],
      },
      { id: 'type', type: 'select', default: 'horizontal', label: 'Type', options: { horizontal: 'Horizontal', vertical: 'Vertical' } },
      { id: 'tab_color', type: 'color', label: 'Title Color' },
      { id: 'tab_active_color', type: 'color', label: 'Active Title Color' },
      { id: 'content_color', type: 'color', label: 'Content Color' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 18. Accordion
  {
    slug: 'accordion',
    name: 'Accordion',
    category: 'general',
    supportedInCore: true,
    description: 'Collapsible accordion drawer panels for FAQs and specs.',
    defaults: {
      tabs: [
        { tab_title: 'Accordion #1', tab_content: '<p>Lorem ipsum dolor sit amet.</p>' },
        { tab_title: 'Accordion #2', tab_content: '<p>Consectetur adipiscing elit.</p>' },
      ],
      icon_align: 'left',
    },
    controls: [
      {
        id: 'tabs',
        type: 'repeater',
        label: 'Accordion Items',
        fields: [
          { id: 'tab_title', type: 'text', default: 'Accordion Title', label: 'Title' },
          { id: 'tab_content', type: 'wysiwyg', default: 'Accordion Content', label: 'Content' },
        ],
      },
      { id: 'icon_align', type: 'select', default: 'left', label: 'Icon Alignment' },
      { id: 'selected_icon', type: 'icons', label: 'Icon' },
      { id: 'selected_active_icon', type: 'icons', label: 'Active Icon' },
      { id: 'title_color', type: 'color', label: 'Title Color' },
      { id: 'title_background', type: 'color', label: 'Title Background' },
      { id: 'content_color', type: 'color', label: 'Content Color' },
      { id: 'content_background', type: 'color', label: 'Content Background' },
      ...TYPOGRAPHY_CONTROLS,
    ],
  },

  // 19. HTML (Safe fallback & custom code)
  {
    slug: 'html',
    name: 'HTML',
    category: 'general',
    supportedInCore: true,
    description: 'Raw HTML markup injection widget.',
    defaults: {
      html: '',
    },
    controls: [
      { id: 'html', type: 'textarea', default: '', label: 'HTML Code' },
    ],
  },

  // 20. Shortcode
  {
    slug: 'shortcode',
    name: 'Shortcode',
    category: 'general',
    supportedInCore: true,
    description: 'WordPress shortcode executor.',
    defaults: {
      shortcode: '',
    },
    controls: [
      { id: 'shortcode', type: 'text', default: '', label: 'Enter your shortcode' },
    ],
  },

  // 21. Alert
  {
    slug: 'alert',
    name: 'Alert',
    category: 'general',
    supportedInCore: true,
    description: 'Informational banner alert box.',
    defaults: {
      alert_type: 'info',
      alert_title: 'This is an Alert',
      alert_description: 'Lorem ipsum dolor sit amet.',
      show_dismiss: 'show',
    },
    controls: [
      { id: 'alert_type', type: 'select', default: 'info', label: 'Type', options: { info: 'Info', success: 'Success', warning: 'Warning', danger: 'Danger' } },
      { id: 'alert_title', type: 'text', default: 'This is an Alert', label: 'Title' },
      { id: 'alert_description', type: 'textarea', default: '', label: 'Description' },
      { id: 'show_dismiss', type: 'select', default: 'show', label: 'Dismiss Button' },
    ],
  },

  // 22. Testimonial
  {
    slug: 'testimonial',
    name: 'Testimonial',
    category: 'general',
    supportedInCore: true,
    description: 'Quote card with author image, name, and role.',
    defaults: {
      testimonial_content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      testimonial_name: 'John Doe',
      testimonial_job: 'Designer',
      testimonial_image: { url: '', id: '' },
      testimonial_image_position: 'aside',
      testimonial_alignment: 'center',
    },
    controls: [
      { id: 'testimonial_content', type: 'textarea', default: '', label: 'Content' },
      { id: 'testimonial_image', type: 'media', label: 'Choose Image' },
      { id: 'testimonial_name', type: 'text', default: 'John Doe', label: 'Name' },
      { id: 'testimonial_job', type: 'text', default: 'Designer', label: 'Job' },
      { id: 'testimonial_image_position', type: 'select', default: 'aside', label: 'Image Position' },
      { id: 'testimonial_alignment', type: 'choose', default: 'center', label: 'Alignment' },
    ],
  },

  // 23. Menu Anchor
  {
    slug: 'menu-anchor',
    name: 'Menu Anchor',
    category: 'general',
    supportedInCore: true,
    description: 'Anchor link destination ID widget.',
    defaults: {
      anchor: '',
    },
    controls: [
      { id: 'anchor', type: 'text', default: '', label: 'The ID of the Menu Anchor' },
    ],
  },

  // 24. Image Carousel
  {
    slug: 'image-carousel',
    name: 'Image Carousel',
    category: 'general',
    supportedInCore: true,
    description: 'Horizontal sliding gallery carousel.',
    defaults: {
      carousel: [],
      slides_to_show: 3,
      navigation: 'both',
      autoplay: 'no',
    },
    controls: [
      { id: 'carousel', type: 'repeater', label: 'Add Images' },
      { id: 'slides_to_show', type: 'select', default: '3', label: 'Slides to Show' },
      { id: 'navigation', type: 'select', default: 'both', label: 'Navigation' },
      { id: 'autoplay', type: 'switcher', default: 'no', label: 'Autoplay' },
    ],
  },
];

// ─── Known Pro Widgets (For detection & enforcement) ─────────────────────────

export const KNOWN_PRO_WIDGET_SLUGS = [
  'posts',
  'portfolio',
  'slides',
  'form',
  'login',
  'animated-headline',
  'price-table',
  'flip-box',
  'call-to-action',
  'media-carousel',
  'testimonial-carousel',
  'reviews',
  'table-of-contents',
  'countdown',
  'share-buttons',
  'blockquote',
  'loop-grid',
  'loop-carousel',
  'off-canvas',
  'lottie',
  'code-highlight',
  'video-playlist',
  'paypal-button',
  'stripe-button',
  'progress-tracker',
  'wp-menu',
  'theme-post-title',
  'theme-post-content',
  'theme-post-excerpt',
  'theme-featured-image',
];

export const BUILT_IN_PRO_WIDGETS: WidgetProfile[] = KNOWN_PRO_WIDGET_SLUGS.map((slug) => ({
  slug,
  name: slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
  category: 'pro-elements',
  supportedInCore: false,
  isPro: true,
  description: `Elementor Pro widget: ${slug}`,
  defaults: {},
  controls: [],
}));

// ─── Widget Registry Store Class ─────────────────────────────────────────────

export interface RegistryLoadResult {
  loaded: number;
  errors: string[];
  warnings: string[];
}

export class WidgetRegistryStore {
  private profiles = new Map<string, WidgetProfile>();

  constructor() {
    this.registerBuiltIns();
  }

  /**
   * Resets registry to built-in profiles.
   */
  public registerBuiltIns(): void {
    this.profiles.clear();
    for (const p of BUILT_IN_CORE_WIDGETS) {
      this.profiles.set(p.slug, { ...p });
    }
    for (const p of BUILT_IN_PRO_WIDGETS) {
      this.profiles.set(p.slug, { ...p });
    }
  }

  /**
   * Retrieve widget profile by slug.
   */
  public get(slug: string): WidgetProfile | undefined {
    return this.profiles.get(slug);
  }

  /**
   * Check if slug exists in registry.
   */
  public has(slug: string): boolean {
    return this.profiles.has(slug);
  }

  /**
   * Get all profiles belonging to a specific category.
   */
  public getByCategory(category: string): WidgetProfile[] {
    const list: WidgetProfile[] = [];
    for (const p of this.profiles.values()) {
      if (p.category.toLowerCase() === category.toLowerCase()) {
        list.push(p);
      }
    }
    return list;
  }

  /**
   * Return all registered profiles.
   */
  public getAll(): WidgetProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Return all Core-supported widget profiles.
   */
  public getCoreWidgets(): WidgetProfile[] {
    return Array.from(this.profiles.values()).filter((p) => p.supportedInCore);
  }

  /**
   * Return all Pro-only widget profiles.
   */
  public getProWidgets(): WidgetProfile[] {
    return Array.from(this.profiles.values()).filter((p) => p.isPro || !p.supportedInCore);
  }

  /**
   * Check if a widget is supported in Elementor Core.
   */
  public isCore(slug: string): boolean {
    const p = this.profiles.get(slug);
    return !!p?.supportedInCore;
  }

  /**
   * Check if a widget requires Elementor Pro.
   */
  public isPro(slug: string): boolean {
    const p = this.profiles.get(slug);
    return !!p && (!p.supportedInCore || !!p.isPro);
  }

  /**
   * Register or overwrite a widget profile.
   */
  public register(profile: WidgetProfile, overwrite = true): boolean {
    const validation = this.validateProfile(profile);
    if (!validation.valid) {
      throw new Error(`Invalid widget profile "${profile?.slug}": ${validation.errors.join(', ')}`);
    }

    if (this.profiles.has(profile.slug) && !overwrite) {
      return false;
    }

    this.profiles.set(profile.slug, profile);
    return true;
  }

  /**
   * Validate a widget profile schema at load time.
   */
  public validateProfile(profile: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!profile || typeof profile !== 'object') {
      errors.push('Profile must be a non-null object');
      return { valid: false, errors };
    }

    if (!profile.slug || typeof profile.slug !== 'string' || profile.slug.trim() === '') {
      errors.push('Widget profile is missing required non-empty string "slug"');
    }

    if (!profile.name || typeof profile.name !== 'string') {
      errors.push('Widget profile is missing required string "name"');
    }

    if (typeof profile.supportedInCore !== 'boolean') {
      errors.push('Widget profile is missing boolean "supportedInCore"');
    }

    if (profile.controls && !Array.isArray(profile.controls)) {
      errors.push('"controls" must be an array of control definitions');
    } else if (Array.isArray(profile.controls)) {
      for (let i = 0; i < profile.controls.length; i++) {
        const c = profile.controls[i];
        if (!c || typeof c !== 'object' || !c.id || typeof c.id !== 'string') {
          errors.push(`Control at index ${i} is missing valid "id"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Load widget profiles from JSON files in a directory.
   */
  public loadFromDirectory(dirPath: string): RegistryLoadResult {
    const result: RegistryLoadResult = {
      loaded: 0,
      errors: [],
      warnings: [],
    };

    if (!fs.existsSync(dirPath)) {
      result.warnings.push(`Directory does not exist: ${dirPath}`);
      return result;
    }

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const filePath = path.join(dirPath, entry.name);
          try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw);

            // May be a single profile or an array/dictionary of profiles
            if (Array.isArray(data)) {
              for (const item of data) {
                const val = this.validateProfile(item);
                if (val.valid) {
                  this.register(item, true);
                  result.loaded++;
                } else {
                  result.errors.push(`File ${entry.name}: ${val.errors.join('; ')}`);
                }
              }
            } else if (data.slug && data.name) {
              const val = this.validateProfile(data);
              if (val.valid) {
                this.register(data, true);
                result.loaded++;
              } else {
                result.errors.push(`File ${entry.name}: ${val.errors.join('; ')}`);
              }
            } else if (data.widget_slug && data.display_name) {
              // Format from server/src/skills/elementor/widgets/*.json
              const profileCandidate = {
                slug: data.widget_slug,
                name: data.display_name,
                category: 'basic',
                supportedInCore: true,
                description: `Elementor Core 4.3.5 widget: ${data.display_name}`,
                defaults: data.native_elementor_node_example?.settings || {},
                controls: Object.keys(data.native_elementor_node_example?.settings || {}).map((k) => ({
                  id: k,
                  type: 'text',
                  label: k,
                })),
              };
              const val = this.validateProfile(profileCandidate);
              if (val.valid) {
                this.register(profileCandidate, true);
                result.loaded++;
              } else {
                result.errors.push(`File ${entry.name}: ${val.errors.join('; ')}`);
              }
            } else if (data.widgets && typeof data.widgets === 'object') {
              for (const [key, item] of Object.entries<any>(data.widgets)) {
                const profileCandidate = { slug: key, ...item };
                const val = this.validateProfile(profileCandidate);
                if (val.valid) {
                  this.register(profileCandidate, true);
                  result.loaded++;
                } else {
                  result.errors.push(`Widget "${key}" in ${entry.name}: ${val.errors.join('; ')}`);
                }
              }
            }
          } catch (fileErr: any) {
            result.errors.push(`Failed to parse ${entry.name}: ${fileErr.message}`);
          }
        }
      }
    } catch (dirErr: any) {
      result.errors.push(`Failed to read directory ${dirPath}: ${dirErr.message}`);
    }

    return result;
  }

  /**
   * Returns a map copy of the current registry.
   */
  public toMap(): WidgetRegistry {
    return new Map(this.profiles);
  }

  /**
   * Clone the store.
   */
  public clone(): WidgetRegistryStore {
    const cloned = new WidgetRegistryStore();
    cloned.profiles = new Map(this.profiles);
    return cloned;
  }
}

// ─── Singleton & Factory Exports ──────────────────────────────────────────────

let globalRegistry: WidgetRegistryStore | null = null;

/**
 * Returns the default singleton widget registry.
 */
export function getRegistry(): WidgetRegistryStore {
  if (!globalRegistry) {
    globalRegistry = new WidgetRegistryStore();
  }
  return globalRegistry;
}

/**
 * Creates a fresh independent instance of the WidgetRegistryStore.
 */
export function createRegistry(): WidgetRegistryStore {
  return new WidgetRegistryStore();
}
