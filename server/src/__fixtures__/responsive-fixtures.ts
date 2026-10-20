/**
 * Deterministic Test Fixtures for Responsive Pipeline Validation.
 * 
 * Five distinct design scenarios:
 * 1. darkGymHeroFixture - Dark theme, athlete photo, CTA, circular stat badge.
 * 2. lightFintechHeroFixture - Light theme, pill badge, headline, hero illustration.
 * 3. multiSectionLandingFixture - Multi-section page with grid cards and footer.
 * 4. narrowTallPageFixture - High aspect-ratio tall screenshot with multi-section flow.
 * 5. multiViewportReconciledFixture - Explicit responsiveOverrides at section and node levels.
 */

import type { DIRDocument } from '../modules/dir/types.js';

export const darkGymHeroFixture: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'dark-gym-hero-hash-001',
    sourceWidth: 1440,
    sourceHeight: 900,
    analysisProvider: 'mock-deterministic',
    analysisModel: 'vision-gym-v1',
    analysisTimestamp: '2026-03-01T00:00:00Z',
    confidenceScore: 0.96,
    schemaVersion: '1.0.0',
    promptVersion: 'v1.6.0',
    notes: ['Dark athletic gym hero with circular stats and high contrast accent']
  },
  breakpoints: {
    desktop: { min: 1024 },
    tablet: { min: 768, max: 1023 },
    mobile: { min: 320, max: 767 }
  },
  globals: {
    colors: {
      background: '#050a04',
      surface: '#121a10',
      primary: '#ff5e14',
      secondary: '#b7f34c',
      accent: '#ff5e14',
      text: '#ffffff',
      textSecondary: '#a1a1aa',
      border: '#27272a'
    },
    typography: {
      fontFamilies: ['Montserrat', 'Inter', 'sans-serif'],
      headingFont: 'Montserrat',
      bodyFont: 'Inter',
      baseSize: 16,
      scale: 1.25
    },
    spacing: {
      unit: 'px',
      base: 8,
      sectionGap: 64,
      containerMaxWidth: 1200
    }
  },
  assets: [
    {
      id: 'asset-gym-hero-photo',
      type: 'image',
      role: 'hero-photo',
      sourceRect: { x: 720, y: 100, width: 650, height: 750 },
      confidence: 0.95
    },
    {
      id: 'asset-gym-logo',
      type: 'logo',
      role: 'brand-logo',
      sourceRect: { x: 40, y: 24, width: 160, height: 48 },
      confidence: 0.98
    }
  ],
  pages: [
    {
      id: 'page_gym_home',
      name: 'Gym Home',
      sections: [
        {
          id: 'sec_gym_header',
          role: 'header',
          label: 'Main Navigation Header',
          confidence: 0.95,
          styles: {
            backgroundColor: '#050a04',
            padding: { top: 20, bottom: 20, left: 40, right: 40 }
          },
          children: [
            {
              id: 'node_header_bar',
              kind: 'flex-group',
              confidence: 0.95,
              direction: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              styles: {},
              children: [
                {
                  id: 'node_header_logo',
                  kind: 'image',
                  confidence: 0.98,
                  assetId: 'asset-gym-logo',
                  alt: 'IronPeak Fitness Logo',
                  styles: { width: 160, height: 48 }
                },
                {
                  id: 'node_nav_links',
                  kind: 'flex-group',
                  confidence: 0.92,
                  direction: 'row',
                  gap: 32,
                  styles: {},
                  children: [
                    { id: 'node_link_programs', kind: 'link', text: 'Programs', url: '#programs', confidence: 0.9, styles: { color: '#ffffff' } },
                    { id: 'node_link_trainers', kind: 'link', text: 'Trainers', url: '#trainers', confidence: 0.9, styles: { color: '#ffffff' } },
                    { id: 'node_link_pricing', kind: 'link', text: 'Pricing', url: '#pricing', confidence: 0.9, styles: { color: '#ffffff' } }
                  ]
                },
                {
                  id: 'node_btn_join',
                  kind: 'button',
                  confidence: 0.95,
                  text: 'JOIN NOW',
                  variant: 'primary',
                  styles: {
                    backgroundColor: '#ff5e14',
                    color: '#ffffff',
                    padding: { top: 12, bottom: 12, left: 24, right: 24 },
                    borderRadius: 6,
                    fontWeight: 700
                  }
                }
              ]
            }
          ]
        },
        {
          id: 'sec_gym_hero',
          role: 'hero',
          label: 'Gym Hero Section',
          confidence: 0.96,
          styles: {
            backgroundColor: '#050a04',
            padding: { top: 60, bottom: 80, left: 40, right: 40 }
          },
          children: [
            {
              id: 'node_hero_split',
              kind: 'container',
              confidence: 0.96,
              direction: 'row',
              gap: 48,
              styles: {},
              children: [
                {
                  id: 'node_hero_copy_col',
                  kind: 'container',
                  confidence: 0.95,
                  direction: 'column',
                  gap: 24,
                  styles: { width: 600 },
                  children: [
                    {
                      id: 'node_hero_h1',
                      kind: 'heading',
                      level: 1,
                      text: 'UNLEASH YOUR LIMITLESS POTENTIAL',
                      confidence: 0.98,
                      styles: {
                        color: '#ffffff',
                        fontSize: 54,
                        fontWeight: 900,
                        lineHeight: 1.1
                      }
                    },
                    {
                      id: 'node_hero_lead',
                      kind: 'text',
                      html: '<p>Personalized elite training routines, nutritional planning, and state of the art equipment built for champions.</p>',
                      confidence: 0.93,
                      styles: {
                        color: '#a1a1aa',
                        fontSize: 18,
                        lineHeight: 1.5
                      }
                    },
                    {
                      id: 'node_hero_cta_btn',
                      kind: 'button',
                      text: 'START FREE TRIAL',
                      variant: 'primary',
                      confidence: 0.97,
                      styles: {
                        backgroundColor: '#ff5e14',
                        color: '#ffffff',
                        padding: { top: 16, bottom: 16, left: 32, right: 32 },
                        borderRadius: 8,
                        fontSize: 18,
                        fontWeight: 800
                      }
                    }
                  ]
                },
                {
                  id: 'node_hero_media_col',
                  kind: 'container',
                  confidence: 0.94,
                  direction: 'column',
                  styles: { width: 550 },
                  children: [
                    {
                      id: 'node_hero_photo',
                      kind: 'image',
                      assetId: 'asset-gym-hero-photo',
                      alt: 'Athlete training in modern gym',
                      confidence: 0.95,
                      styles: {
                        width: 550,
                        height: 500,
                        borderRadius: 16
                      }
                    },
                    {
                      id: 'node_circular_stat_card',
                      kind: 'container',
                      confidence: 0.92,
                      direction: 'column',
                      styles: {
                        backgroundColor: '#121a10',
                        borderRadius: 9999,
                        width: 140,
                        height: 140,
                        borderWidth: 2,
                        borderColor: '#b7f34c',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: { top: 16, bottom: 16, left: 16, right: 16 }
                      },
                      children: [
                        {
                          id: 'node_stat_counter',
                          kind: 'counter',
                          value: 85,
                          prefix: '+',
                          suffix: '%',
                          confidence: 0.92,
                          styles: {
                            color: '#b7f34c',
                            fontSize: 28,
                            fontWeight: 800
                          }
                        },
                        {
                          id: 'node_stat_label',
                          kind: 'text',
                          html: '<span>Client Progress</span>',
                          confidence: 0.9,
                          styles: {
                            color: '#ffffff',
                            fontSize: 12,
                            textAlign: 'center'
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

export const lightFintechHeroFixture: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'light-fintech-hash-002',
    sourceWidth: 1440,
    sourceHeight: 900,
    analysisProvider: 'mock-deterministic',
    analysisModel: 'vision-fintech-v1',
    analysisTimestamp: '2026-03-01T00:00:00Z',
    confidenceScore: 0.94,
    schemaVersion: '1.0.0',
    promptVersion: 'v1.6.0',
    notes: ['Light theme fintech page with pill badge and modern card components']
  },
  breakpoints: {
    desktop: { min: 1024 },
    tablet: { min: 768, max: 1023 },
    mobile: { min: 320, max: 767 }
  },
  globals: {
    colors: {
      background: '#ffffff',
      surface: '#f8fafc',
      primary: '#2563eb',
      secondary: '#0f172a',
      accent: '#10b981',
      text: '#0f172a',
      textSecondary: '#64748b',
      border: '#e2e8f0'
    },
    typography: {
      fontFamilies: ['Inter', 'system-ui', 'sans-serif'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      baseSize: 16,
      scale: 1.2
    },
    spacing: {
      unit: 'px',
      base: 8,
      sectionGap: 64,
      containerMaxWidth: 1200
    }
  },
  assets: [
    {
      id: 'asset-fintech-illustration',
      type: 'image',
      role: 'dashboard-preview',
      sourceRect: { x: 780, y: 140, width: 600, height: 480 },
      confidence: 0.95
    }
  ],
  pages: [
    {
      id: 'page_fintech_main',
      name: 'Fintech Home',
      sections: [
        {
          id: 'sec_fintech_hero',
          role: 'hero',
          label: 'Fintech Hero',
          confidence: 0.95,
          styles: {
            backgroundColor: '#ffffff',
            padding: { top: 80, bottom: 80, left: 48, right: 48 }
          },
          children: [
            {
              id: 'node_fintech_row',
              kind: 'container',
              confidence: 0.95,
              direction: 'row',
              gap: 60,
              styles: { alignItems: 'center' },
              children: [
                {
                  id: 'node_fintech_col_left',
                  kind: 'container',
                  confidence: 0.95,
                  direction: 'column',
                  gap: 20,
                  styles: { width: 580 },
                  children: [
                    {
                      id: 'node_fintech_pill_badge',
                      kind: 'badge',
                      text: 'Next-Gen Financial Operating System',
                      confidence: 0.94,
                      styles: {
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        borderRadius: 9999,
                        padding: { top: 6, bottom: 6, left: 16, right: 16 },
                        fontSize: 13,
                        fontWeight: 600
                      }
                    },
                    {
                      id: 'node_fintech_headline',
                      kind: 'heading',
                      level: 1,
                      text: 'Smart Financial Freedom at Scale',
                      confidence: 0.98,
                      styles: {
                        color: '#0f172a',
                        fontSize: 52,
                        fontWeight: 800,
                        lineHeight: 1.15
                      }
                    },
                    {
                      id: 'node_fintech_subtext',
                      kind: 'text',
                      html: '<p>Consolidate your global accounts, track liquidity, and automate multi-currency transfers with bank-grade encryption.</p>',
                      confidence: 0.92,
                      styles: {
                        color: '#64748b',
                        fontSize: 18,
                        lineHeight: 1.6
                      }
                    },
                    {
                      id: 'node_fintech_btn_group',
                      kind: 'flex-group',
                      direction: 'row',
                      gap: 16,
                      confidence: 0.95,
                      styles: {},
                      children: [
                        {
                          id: 'node_fintech_cta_pri',
                          kind: 'button',
                          text: 'Open Account',
                          variant: 'primary',
                          confidence: 0.95,
                          styles: {
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            padding: { top: 14, bottom: 14, left: 28, right: 28 },
                            borderRadius: 8,
                            fontSize: 16,
                            fontWeight: 600
                          }
                        },
                        {
                          id: 'node_fintech_cta_sec',
                          kind: 'button',
                          text: 'Explore Platform',
                          variant: 'outline',
                          confidence: 0.9,
                          styles: {
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            padding: { top: 14, bottom: 14, left: 28, right: 28 },
                            borderRadius: 8,
                            fontSize: 16,
                            fontWeight: 600
                          }
                        }
                      ]
                    }
                  ]
                },
                {
                  id: 'node_fintech_col_right',
                  kind: 'container',
                  direction: 'column',
                  confidence: 0.94,
                  styles: { width: 560 },
                  children: [
                    {
                      id: 'node_fintech_illus_img',
                      kind: 'image',
                      assetId: 'asset-fintech-illustration',
                      alt: 'Interactive dashboard analytics visualization',
                      confidence: 0.95,
                      styles: {
                        width: 560,
                        height: 420,
                        borderRadius: 12
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

export const multiSectionLandingFixture: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'multi-section-landing-003',
    sourceWidth: 1440,
    sourceHeight: 1800,
    analysisProvider: 'mock-deterministic',
    analysisModel: 'vision-landing-v1',
    analysisTimestamp: '2026-03-01T00:00:00Z',
    confidenceScore: 0.95,
    schemaVersion: '1.0.0',
    promptVersion: 'v1.6.0',
    notes: ['Multi-section landing with header, hero, 3-card grid, and comprehensive footer']
  },
  breakpoints: {
    desktop: { min: 1024 },
    tablet: { min: 768, max: 1023 },
    mobile: { min: 320, max: 767 }
  },
  globals: {
    colors: {
      background: '#ffffff',
      surface: '#f1f5f9',
      primary: '#0ea5e9',
      secondary: '#0f172a',
      accent: '#f59e0b',
      text: '#0f172a',
      textSecondary: '#64748b',
      border: '#cbd5e1'
    },
    typography: {
      fontFamilies: ['Inter', 'sans-serif'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      baseSize: 16,
      scale: 1.25
    },
    spacing: {
      unit: 'px',
      base: 8,
      sectionGap: 64,
      containerMaxWidth: 1200
    }
  },
  assets: [],
  pages: [
    {
      id: 'page_multi_landing',
      name: 'Landing Page',
      sections: [
        {
          id: 'sec_multi_header',
          role: 'header',
          label: 'Header Section',
          confidence: 0.98,
          styles: {
            backgroundColor: '#ffffff',
            padding: { top: 16, bottom: 16, left: 32, right: 32 }
          },
          children: [
            {
              id: 'node_multi_h1_logo',
              kind: 'heading',
              level: 2,
              text: 'SaaSCloud',
              confidence: 0.99,
              styles: { color: '#0ea5e9', fontSize: 24, fontWeight: 800 }
            }
          ]
        },
        {
          id: 'sec_multi_hero',
          role: 'hero',
          label: 'Hero Intro',
          confidence: 0.96,
          styles: {
            backgroundColor: '#f1f5f9',
            padding: { top: 64, bottom: 64, left: 32, right: 32 }
          },
          children: [
            {
              id: 'node_multi_hero_h1',
              kind: 'heading',
              level: 1,
              text: 'Build Cloud Infrastructures Fast',
              confidence: 0.98,
              styles: { color: '#0f172a', fontSize: 48, fontWeight: 800, textAlign: 'center' }
            },
            {
              id: 'node_multi_hero_sub',
              kind: 'text',
              html: '<p>Deploy resilient serverless clusters in minutes across 20 global regions.</p>',
              confidence: 0.92,
              styles: { color: '#64748b', fontSize: 18, textAlign: 'center' }
            }
          ]
        },
        {
          id: 'sec_multi_features',
          role: 'feature',
          label: 'Three Column Features',
          confidence: 0.95,
          styles: {
            backgroundColor: '#ffffff',
            padding: { top: 64, bottom: 64, left: 32, right: 32 }
          },
          children: [
            {
              id: 'node_feature_grid',
              kind: 'grid-group',
              columns: 3,
              confidence: 0.96,
              styles: { gap: 24 },
              children: [
                {
                  id: 'node_card_feat_1',
                  kind: 'card',
                  confidence: 0.94,
                  styles: {
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    padding: { top: 24, bottom: 24, left: 24, right: 24 },
                    borderWidth: 1,
                    borderColor: '#e2e8f0'
                  },
                  children: [
                    { id: 'node_card_h3_1', kind: 'heading', level: 3, text: 'Instant Edge Deploy', confidence: 0.95, styles: { fontSize: 20, color: '#0f172a' } },
                    { id: 'node_card_desc_1', kind: 'text', html: '<p>Push to git and watch global replicas sync in sub-second times.</p>', confidence: 0.9, styles: { fontSize: 14, color: '#64748b' } }
                  ]
                },
                {
                  id: 'node_card_feat_2',
                  kind: 'card',
                  confidence: 0.94,
                  styles: {
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    padding: { top: 24, bottom: 24, left: 24, right: 24 },
                    borderWidth: 1,
                    borderColor: '#e2e8f0'
                  },
                  children: [
                    { id: 'node_card_h3_2', kind: 'heading', level: 3, text: 'Zero Trust Security', confidence: 0.95, styles: { fontSize: 20, color: '#0f172a' } },
                    { id: 'node_card_desc_2', kind: 'text', html: '<p>End to end cryptographic isolation for all microservices.</p>', confidence: 0.9, styles: { fontSize: 14, color: '#64748b' } }
                  ]
                },
                {
                  id: 'node_card_feat_3',
                  kind: 'card',
                  confidence: 0.94,
                  styles: {
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    padding: { top: 24, bottom: 24, left: 24, right: 24 },
                    borderWidth: 1,
                    borderColor: '#e2e8f0'
                  },
                  children: [
                    { id: 'node_card_h3_3', kind: 'heading', level: 3, text: 'Elastic Auto-Scale', confidence: 0.95, styles: { fontSize: 20, color: '#0f172a' } },
                    { id: 'node_card_desc_3', kind: 'text', html: '<p>Seamlessly scales from zero requests up to millions per second.</p>', confidence: 0.9, styles: { fontSize: 14, color: '#64748b' } }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'sec_multi_footer',
          role: 'footer',
          label: 'Site Footer',
          confidence: 0.97,
          styles: {
            backgroundColor: '#0f172a',
            padding: { top: 40, bottom: 40, left: 32, right: 32 }
          },
          children: [
            {
              id: 'node_footer_row',
              kind: 'container',
              direction: 'row',
              confidence: 0.95,
              styles: {
                justifyContent: 'space-between',
                alignItems: 'center'
              },
              children: [
                {
                  id: 'node_footer_copy',
                  kind: 'text',
                  html: '<p>© 2026 SaaSCloud Inc. All rights reserved.</p>',
                  confidence: 0.95,
                  styles: { color: '#94a3b8', fontSize: 14 }
                },
                {
                  id: 'node_footer_links',
                  kind: 'flex-group',
                  direction: 'row',
                  gap: 20,
                  confidence: 0.92,
                  styles: {},
                  children: [
                    { id: 'node_fl_privacy', kind: 'link', text: 'Privacy Policy', url: '#privacy', confidence: 0.9, styles: { color: '#94a3b8', fontSize: 14 } },
                    { id: 'node_fl_terms', kind: 'link', text: 'Terms of Service', url: '#terms', confidence: 0.9, styles: { color: '#94a3b8', fontSize: 14 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

export const narrowTallPageFixture: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'narrow-tall-page-004',
    sourceWidth: 800,
    sourceHeight: 3200,
    analysisProvider: 'mock-deterministic',
    analysisModel: 'vision-tiled-v1',
    analysisTimestamp: '2026-03-01T00:00:00Z',
    confidenceScore: 0.91,
    schemaVersion: '1.0.0',
    promptVersion: 'v1.6.0',
    notes: ['Narrow tall full page screenshot simulating multi-tile stitching']
  },
  breakpoints: {
    desktop: { min: 1024 },
    tablet: { min: 768, max: 1023 },
    mobile: { min: 320, max: 767 }
  },
  globals: {
    colors: {
      background: '#fcfcfc',
      surface: '#ffffff',
      primary: '#6366f1',
      secondary: '#1e293b',
      accent: '#ec4899',
      text: '#1e293b',
      textSecondary: '#64748b',
      border: '#e2e8f0'
    },
    typography: {
      fontFamilies: ['Inter', 'sans-serif'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      baseSize: 16,
      scale: 1.2
    },
    spacing: {
      unit: 'px',
      base: 8,
      sectionGap: 48,
      containerMaxWidth: 760
    }
  },
  assets: [],
  pages: [
    {
      id: 'page_narrow_tall',
      name: 'Narrow Article & Showcase',
      sections: [
        {
          id: 'sec_narrow_hero',
          role: 'hero',
          label: 'Narrow Top Hero',
          confidence: 0.95,
          styles: {
            backgroundColor: '#ffffff',
            padding: { top: 40, bottom: 40, left: 24, right: 24 }
          },
          children: [
            {
              id: 'node_narrow_h1',
              kind: 'heading',
              level: 1,
              text: 'The Future of Agentic Automation',
              confidence: 0.98,
              styles: { fontSize: 36, color: '#1e293b', fontWeight: 800 }
            },
            {
              id: 'node_narrow_p1',
              kind: 'text',
              html: '<p>Detailed longform analysis on autonomous code generation workflows.</p>',
              confidence: 0.93,
              styles: { fontSize: 16, color: '#64748b' }
            }
          ]
        },
        {
          id: 'sec_narrow_content_1',
          role: 'content',
          label: 'Section One: Background',
          confidence: 0.92,
          styles: {
            backgroundColor: '#fcfcfc',
            padding: { top: 32, bottom: 32, left: 24, right: 24 }
          },
          children: [
            {
              id: 'node_narrow_h2_1',
              kind: 'heading',
              level: 2,
              text: '1. Theoretical Frameworks',
              confidence: 0.95,
              styles: { fontSize: 24, color: '#1e293b', fontWeight: 700 }
            },
            {
              id: 'node_narrow_p2',
              kind: 'text',
              html: '<p>Deterministic Intermediate Representations bridge visual input and target AST structures.</p>',
              confidence: 0.9,
              styles: { fontSize: 16, color: '#1e293b' }
            }
          ]
        },
        {
          id: 'sec_narrow_content_2',
          role: 'content',
          label: 'Section Two: Empirical Validation',
          confidence: 0.91,
          styles: {
            backgroundColor: '#ffffff',
            padding: { top: 32, bottom: 32, left: 24, right: 24 }
          },
          children: [
            {
              id: 'node_narrow_h2_2',
              kind: 'heading',
              level: 2,
              text: '2. Responsive Clamping',
              confidence: 0.94,
              styles: { fontSize: 24, color: '#1e293b', fontWeight: 700 }
            },
            {
              id: 'node_narrow_p3',
              kind: 'text',
              html: '<p>Preventing viewport blowouts through deterministic percentage clamping on mobile viewports.</p>',
              confidence: 0.91,
              styles: { fontSize: 16, color: '#1e293b' }
            }
          ]
        },
        {
          id: 'sec_narrow_cta',
          role: 'cta',
          label: 'Bottom Signup',
          confidence: 0.95,
          styles: {
            backgroundColor: '#6366f1',
            padding: { top: 40, bottom: 40, left: 24, right: 24 }
          },
          children: [
            {
              id: 'node_narrow_cta_h2',
              kind: 'heading',
              level: 2,
              text: 'Subscribe for Research Updates',
              confidence: 0.96,
              styles: { fontSize: 28, color: '#ffffff', textAlign: 'center' }
            },
            {
              id: 'node_narrow_cta_btn',
              kind: 'button',
              text: 'Join 10,000+ Engineers',
              variant: 'primary',
              confidence: 0.95,
              styles: {
                backgroundColor: '#ffffff',
                color: '#6366f1',
                padding: { top: 12, bottom: 12, left: 24, right: 24 },
                borderRadius: 6,
                fontWeight: 700
              }
            }
          ]
        }
      ]
    }
  ]
};

export const multiViewportReconciledFixture: DIRDocument = {
  version: '1.0.0',
  meta: {
    sourceImageHash: 'multi-viewport-005',
    sourceWidth: 1440,
    sourceHeight: 900,
    analysisProvider: 'mock-deterministic',
    analysisModel: 'vision-multiview-v1',
    analysisTimestamp: '2026-03-01T00:00:00Z',
    confidenceScore: 0.97,
    schemaVersion: '1.0.0',
    promptVersion: 'v1.6.0',
    notes: ['Explicit multi-viewport reconciliation with responsiveOverrides on sections and nodes']
  },
  breakpoints: {
    desktop: { min: 1024 },
    tablet: { min: 768, max: 1023 },
    mobile: { min: 320, max: 767 }
  },
  globals: {
    colors: {
      background: '#090d16',
      surface: '#111827',
      primary: '#38bdf8',
      secondary: '#818cf8',
      accent: '#f43f5e',
      text: '#f8fafc',
      textSecondary: '#94a3b8',
      border: '#1e293b'
    },
    typography: {
      fontFamilies: ['Inter', 'sans-serif'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      baseSize: 16,
      scale: 1.25
    },
    spacing: {
      unit: 'px',
      base: 8,
      sectionGap: 64,
      containerMaxWidth: 1200
    }
  },
  assets: [
    {
      id: 'asset-multiview-app',
      type: 'image',
      role: 'app-preview',
      sourceRect: { x: 740, y: 120, width: 620, height: 600 },
      confidence: 0.96
    }
  ],
  pages: [
    {
      id: 'page_multiview',
      name: 'Multi-Viewport Showcase',
      sections: [
        {
          id: 'sec_mv_hero',
          role: 'hero',
          label: 'Multi-Device Reconciled Hero',
          confidence: 0.98,
          styles: {
            backgroundColor: '#090d16',
            padding: { top: 80, bottom: 80, left: 40, right: 40 }
          },
          responsiveOverrides: {
            tablet: {
              padding: { top: 48, bottom: 48, left: 24, right: 24 }
            },
            mobile: {
              padding: { top: 24, bottom: 24, left: 16, right: 16 }
            }
          },
          children: [
            {
              id: 'node_mv_row',
              kind: 'container',
              direction: 'row',
              gap: 40,
              confidence: 0.97,
              styles: { alignItems: 'center' },
              responsiveOverrides: {
                tablet: {
                  flexDirection: 'column',
                  gap: 32
                },
                mobile: {
                  flexDirection: 'column',
                  gap: 20
                }
              },
              children: [
                {
                  id: 'node_mv_col_text',
                  kind: 'container',
                  direction: 'column',
                  gap: 24,
                  confidence: 0.97,
                  styles: { width: 560 },
                  responsiveOverrides: {
                    tablet: {
                      width: 700
                    },
                    mobile: {
                      width: 360
                    }
                  },
                  children: [
                    {
                      id: 'node_mv_headline',
                      kind: 'heading',
                      level: 1,
                      text: 'Unified Multi-Device Intelligence',
                      confidence: 0.99,
                      styles: {
                        color: '#f8fafc',
                        fontSize: 56,
                        fontWeight: 900,
                        lineHeight: 1.1
                      },
                      responsiveOverrides: {
                        tablet: {
                          fontSize: 38
                        },
                        mobile: {
                          fontSize: 28,
                          textAlign: 'center'
                        }
                      }
                    },
                    {
                      id: 'node_mv_body',
                      kind: 'text',
                      html: '<p>Responsive design intermediate representations guarantee flawless layout fidelity from 4K down to phone screens.</p>',
                      confidence: 0.95,
                      styles: {
                        color: '#94a3b8',
                        fontSize: 18,
                        lineHeight: 1.6
                      },
                      responsiveOverrides: {
                        tablet: {
                          fontSize: 16
                        },
                        mobile: {
                          fontSize: 15,
                          textAlign: 'center'
                        }
                      }
                    },
                    {
                      id: 'node_mv_btn',
                      kind: 'button',
                      text: 'Deploy Everywhere',
                      variant: 'primary',
                      confidence: 0.96,
                      styles: {
                        backgroundColor: '#38bdf8',
                        color: '#090d16',
                        padding: { top: 16, bottom: 16, left: 32, right: 32 },
                        borderRadius: 8,
                        fontSize: 16,
                        fontWeight: 700
                      },
                      responsiveOverrides: {
                        mobile: {
                          padding: { top: 14, bottom: 14, left: 24, right: 24 }
                        }
                      }
                    }
                  ]
                },
                {
                  id: 'node_mv_col_img',
                  kind: 'container',
                  direction: 'column',
                  confidence: 0.96,
                  styles: { width: 560 },
                  responsiveOverrides: {
                    tablet: {
                      width: 680
                    },
                    mobile: {
                      width: 350
                    }
                  },
                  children: [
                    {
                      id: 'node_mv_image',
                      kind: 'image',
                      assetId: 'asset-multiview-app',
                      alt: 'Responsive app viewport showcase',
                      confidence: 0.97,
                      styles: {
                        width: 560,
                        height: 480,
                        borderRadius: 16
                      },
                      responsiveOverrides: {
                        tablet: {
                          width: 680,
                          height: 420
                        },
                        mobile: {
                          width: 350,
                          height: 280
                        }
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};
