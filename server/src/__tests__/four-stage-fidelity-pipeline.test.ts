import { describe, it, expect } from 'vitest';
import { generateElementId, convertDIRToElementor } from '../modules/elementor/generator.js';
import { serializeElementorTemplate, optimizeElementorDocument } from '../modules/elementor/serializer.js';
import { validateElementor } from '../modules/elementor/validator.js';
import { validateDIR } from '../modules/dir/schema.js';
import {
  getImageAnalysisPrompt,
  getElementorSelfHealingGatePrompt,
  PROMPT_VERSIONS,
} from '../modules/conversion/prompts.js';
import type { DIRDocument } from '../modules/dir/types.js';

describe('Four-Stage Fidelity Pipeline & Boss Feedback Specifications', () => {
  describe('Stage A & B: Canvas Isolation & Strict DIR Schema', () => {
    it('should generate an Image Analysis prompt containing Canvas Isolation instructions', () => {
      const prompt = getImageAnalysisPrompt({
        width: 1440,
        height: 900,
        mimeType: 'image/png',
        sha256: 'abc123mockhash',
      });

      expect(prompt.version).toBe(PROMPT_VERSIONS.IMAGE_ANALYSIS);
      expect(prompt.systemPrompt).toContain('CANVAS ISOLATION RULE (MANDATORY)');
      expect(prompt.systemPrompt).toContain('canvas_bounds');
      expect(prompt.systemPrompt).toContain('crop_mockup');
      expect(prompt.systemPrompt).toContain('layout_tree');
      expect(prompt.systemPrompt).toContain('typography');
      expect(prompt.systemPrompt).toContain('form_details');
      expect(prompt.systemPrompt).toContain('composite_graphic_asset');
    });

    it('should successfully validate DIR with canvas_bounds, typography, form_details, and composite_graphic_asset', () => {
      const dirDoc: DIRDocument = {
        version: '1.0.0',
        canvas_bounds: {
          crop_mockup: true,
          inner_bg_type: 'solid',
          primary_hex: '#0a0f1d',
        },
        meta: {
          sourceImageHash: 'sha256-hash',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'ai',
          analysisModel: 'gemini-2.5-flash',
          analysisTimestamp: new Date().toISOString(),
          confidenceScore: 0.98,
          schemaVersion: '1.0.0',
          promptVersion: 'v2.0.0',
          notes: ['Canvas isolated inner landing card'],
        },
        breakpoints: {
          desktop: { min: 1024 },
          tablet: { min: 768, max: 1023 },
          mobile: { min: 320, max: 767 },
        },
        globals: {
          colors: {
            background: '#0a0f1d',
            text: '#ffffff',
            primary: '#6366f1',
          },
          typography: {
            fontFamilies: ['Inter', 'sans-serif'],
            baseSize: 16,
            scale: 1.25,
          },
          spacing: {
            unit: 'px',
            base: 8,
            sectionGap: 64,
            containerMaxWidth: 1200,
          },
        },
        assets: [
          {
            id: 'asset_hero_blob',
            type: 'image',
            role: 'hero-graphic-blob',
            confidence: 0.95,
            composite_graphic_asset: true,
            sourceRect: { x: 800, y: 150, width: 500, height: 500 },
          },
        ],
        pages: [
          {
            id: 'page_main',
            name: 'Home',
            sections: [
              {
                id: 'sec_hero',
                role: 'hero',
                label: 'Hero Section',
                confidence: 0.96,
                canvas_bounds: {
                  crop_mockup: true,
                  inner_bg_type: 'solid',
                  primary_hex: '#0a0f1d',
                },
                styles: {
                  backgroundColor: '#0a0f1d',
                  padding: { top: 80, bottom: 80, left: 24, right: 24 },
                },
                children: [
                  {
                    id: 'node_heading',
                    kind: 'heading',
                    text: 'Deploy High-Converting Funnels',
                    level: 1,
                    confidence: 0.98,
                    typography: {
                      font_family_guess: 'Montserrat',
                      font_size_px: 56,
                      font_weight: 800,
                      color_hex: '#ffffff',
                      inline_color_spans: [
                        { text: 'High-Converting', color_hex: '#6366f1' },
                      ],
                    },
                    styles: {
                      color: '#ffffff',
                      fontSize: 56,
                      fontWeight: 800,
                    },
                  },
                  {
                    id: 'node_form',
                    kind: 'form',
                    confidence: 0.94,
                    form_details: {
                      placeholder: 'Enter your work email...',
                      background_hex: '#1e293b',
                      border_radius_px: 50,
                      field_gap_px: 12,
                      submit_button: {
                        text: 'Claim Invite',
                        width_type: 'auto',
                        gradient_hex: '#6366f1',
                        icon_position: 'right',
                      },
                    },
                    styles: {
                      gap: 12,
                    },
                    children: [
                      {
                        id: 'node_email_input',
                        kind: 'input',
                        confidence: 0.95,
                        form_details: {
                          placeholder: 'Enter your work email...',
                          background_hex: '#1e293b',
                          border_radius_px: 50,
                        },
                        styles: {
                          backgroundColor: '#1e293b',
                          borderRadius: 50,
                          color: '#ffffff',
                        },
                      },
                      {
                        id: 'node_submit_btn',
                        kind: 'button',
                        text: 'Claim Invite',
                        confidence: 0.95,
                        styles: {
                          backgroundColor: '#6366f1',
                          color: '#ffffff',
                          borderRadius: 50,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = validateDIR(dirDoc);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.document?.canvas_bounds?.crop_mockup).toBe(true);
      expect(result.document?.pages[0].sections[0].canvas_bounds?.primary_hex).toBe('#0a0f1d');
    });
  });

  describe('Stage C: Elementor AST Generator (Flexbox Containers & 7-Char IDs)', () => {
    it('should generate exactly 7-character hexadecimal element IDs', () => {
      for (let i = 0; i < 50; i++) {
        const id = generateElementId();
        expect(id).toHaveLength(7);
        expect(id).toMatch(/^[0-9a-f]{7}$/);
      }
    });

    it('should strictly produce modern Flexbox Containers without legacy sections or columns', () => {
      const minimalDIR: DIRDocument = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'dummy',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'mock',
          analysisModel: 'mock',
          analysisTimestamp: new Date().toISOString(),
          confidenceScore: 1,
          schemaVersion: '1.0.0',
          promptVersion: 'v2.0.0',
          notes: [],
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {
          colors: { background: '#111827', text: '#ffffff', primary: '#3b82f6' },
          typography: { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, scale: 1.2 },
        },
        assets: [],
        pages: [
          {
            id: 'page_main',
            name: 'Home',
            sections: [
              {
                id: 'sec_1',
                role: 'hero',
                confidence: 1,
                styles: { backgroundColor: '#111827' },
                children: [
                  {
                    id: 'btn_1',
                    kind: 'button',
                    text: 'Get Started',
                    confidence: 1,
                    styles: { backgroundColor: '#3b82f6', color: '#ffffff' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { document } = convertDIRToElementor(minimalDIR);
      expect(document.content[0].elType).toBe('container');
      expect(document.content[0].id).toHaveLength(7);

      const validation = validateElementor(document);
      expect(validation.valid).toBe(true);
      expect(validation.warnings.some((w) => w.code === 'LEGACY_ELTYPE')).toBe(false);
    });

    it('should render input fields matching form_details as styled HTML input widgets', () => {
      const formDIR: DIRDocument = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'dummy-form',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'mock',
          analysisModel: 'mock',
          analysisTimestamp: new Date().toISOString(),
          confidenceScore: 1,
          schemaVersion: '1.0.0',
          promptVersion: 'v2.0.0',
          notes: [],
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {
          colors: { background: '#000000', text: '#ffffff' },
          typography: { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, scale: 1.2 },
        },
        assets: [],
        pages: [
          {
            id: 'page_main',
            name: 'Form Test',
            sections: [
              {
                id: 'sec_cta',
                role: 'cta',
                confidence: 1,
                styles: {},
                children: [
                  {
                    id: 'input_email',
                    kind: 'input',
                    confidence: 0.95,
                    form_details: {
                      placeholder: 'Your Business Email',
                      background_hex: '#1f2937',
                      border_radius_px: 50,
                    },
                    styles: {
                      backgroundColor: '#1f2937',
                      color: '#ffffff',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const { document } = convertDIRToElementor(formDIR);
      const rootContainer = document.content[0];
      const inputWidget = rootContainer.elements[0];

      expect(inputWidget.elType).toBe('widget');
      expect(inputWidget.widgetType).toBe('html');
      expect(inputWidget.settings.html).toContain('Your Business Email');
      expect(inputWidget.settings.html).toContain('border-radius:50px');
    });

    it('should preserve composite_graphic_asset flag on image nodes without distortion', () => {
      const assetDIR: DIRDocument = {
        version: '1.0.0',
        meta: {
          sourceImageHash: 'dummy-asset',
          sourceWidth: 1440,
          sourceHeight: 900,
          analysisProvider: 'mock',
          analysisModel: 'mock',
          analysisTimestamp: new Date().toISOString(),
          confidenceScore: 1,
          schemaVersion: '1.0.0',
          promptVersion: 'v2.0.0',
          notes: [],
        },
        breakpoints: { desktop: { min: 1024 } },
        globals: {
          colors: { background: '#ffffff', text: '#000000' },
          typography: { fontFamilies: ['Inter'], headingFont: 'Inter', bodyFont: 'Inter', baseSize: 16, scale: 1.2 },
        },
        assets: [
          {
            id: 'blob_art',
            type: 'image',
            role: 'organic-blob',
            confidence: 0.9,
            composite_graphic_asset: true,
            placeholder: 'https://placehold.co/500x500.png',
          },
        ],
        pages: [
          {
            id: 'page_main',
            name: 'Asset Test',
            sections: [
              {
                id: 'sec_art',
                role: 'hero',
                confidence: 1,
                styles: {},
                children: [
                  {
                    id: 'node_art',
                    kind: 'image',
                    assetId: 'blob_art',
                    composite_graphic_asset: true,
                    confidence: 0.95,
                    styles: {},
                  },
                ],
              },
            ],
          },
        ],
      };

      const { document } = convertDIRToElementor(assetDIR);
      const imgWidget = document.content[0].elements[0];
      expect(imgWidget.widgetType).toBe('image');
      expect(imgWidget.settings['object-fit']).toBe('contain');
    });
  });

  describe('Envelope Versioning & Direct Hex Colors (No __globals__ Override)', () => {
    it('should include explicit elementor_version: "3.24.7" and wp_version: "6.6.2" in serialized envelope', () => {
      const doc = {
        version: '0.4',
        elementor_version: '3.24.7',
        wp_version: '6.6.2',
        title: 'Canvas Landing Page',
        type: 'page',
        page_settings: {
          template: 'elementor_canvas',
          background_color: '#0d1117',
        },
        content: [],
      };

      const serialized = serializeElementorTemplate(doc);
      const parsed = JSON.parse(serialized);

      expect(parsed.version).toBe('0.4');
      expect(parsed.elementor_version).toBe('3.24.7');
      expect(parsed.wp_version).toBe('6.6.2');
      expect(parsed.type).toBe('page');
      expect(parsed.page_settings.template).toBe('elementor_canvas');
    });

    it('should strip any __globals__ references to ensure pure direct hex styling', () => {
      const docWithGlobals: any = {
        version: '0.4',
        title: 'Globals Test',
        type: 'page',
        content: [
          {
            id: 'a1b2c3d',
            elType: 'container',
            settings: {
              background_color: '#0d1117',
              __globals__: {
                background_color: 'globals/colors?id=primary',
              },
            },
            elements: [
              {
                id: 'e4f5a6b',
                elType: 'widget',
                widgetType: 'heading',
                settings: {
                  title: 'Header Text',
                  title_color: '#ffffff',
                  __globals__: {
                    title_color: 'globals/colors?id=secondary',
                  },
                },
                elements: [],
              },
            ],
          },
        ],
      };

      const optimized = optimizeElementorDocument(docWithGlobals);
      expect(optimized.content[0].settings.__globals__).toBeUndefined();
      expect(optimized.content[0].settings.background_color).toBe('#0d1117');
      expect(optimized.content[0].elements[0].settings.__globals__).toBeUndefined();
      expect(optimized.content[0].elements[0].settings.title_color).toBe('#ffffff');
    });
  });

  describe('Stage D: Validation & Self-Healing Gate Prompt', () => {
    it('should construct a valid Stage D prompt with checklist and verification rules', () => {
      const mockDir = { version: '1.0.0', pages: [] };
      const mockAst = { version: '0.4', content: [] };
      const prompt = getElementorSelfHealingGatePrompt(mockDir, mockAst, [
        { path: 'content[0].widgetType', message: 'Missing bottom credits widget' },
      ]);

      expect(prompt.version).toBe(PROMPT_VERSIONS.ELEMENTOR_SELF_HEALING);
      expect(prompt.systemPrompt).toContain('Elementor Validation & Self-Healing Gate (Stage D)');
      expect(prompt.systemPrompt).toContain('MISSING WIDGET RESTORATION');
      expect(prompt.systemPrompt).toContain('STRICT CONTAINER ARCHITECTURE');
      expect(prompt.systemPrompt).toContain('7-CHARACTER UNIQUE IDS');
      expect(prompt.systemPrompt).toContain('DIRECT HEX COLOR ENFORCEMENT');
      expect(prompt.userPrompt).toContain('Missing bottom credits widget');
    });
  });

  describe('Prohibited Custom Code Shortcuts Detection', () => {
    it('should flag a warning when a whole section or header/footer is substituted with an HTML block', () => {
      const docWithFakeHtmlSection = {
        version: '0.4',
        content: [
          {
            id: 'sec0001',
            elType: 'widget',
            widgetType: 'html',
            settings: {
              html: '<section class="my-hero"><h1>Fake Heading</h1><nav><a href="#">Link</a></nav></section>',
            },
            elements: [],
          },
        ],
      };

      const result = validateElementor(docWithFakeHtmlSection);
      expect(result.warnings.some((w) => w.code === 'PROHIBITED_CUSTOM_CODE_SHORTCUT')).toBe(true);
    });
  });
});

