/**
 * Client Inspectors Test Suite
 * Tests DIRInspector and ElementorInspector rendering, element counting, and recursive node trees
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DIRInspector } from '../components/conversion/dir-inspector.js';
import { ElementorInspector } from '../components/conversion/elementor-inspector.js';

describe('Conversion Inspectors', () => {
  const mockDir = {
    version: '1.0.0',
    meta: {
      confidenceScore: 0.95,
      analysisProvider: 'mock',
      analysisModel: 'gemini-3.8-flash',
    },
    globals: {
      colors: {
        background: '#071312',
        text: '#ffffff',
        primary: '#ff3823',
      },
    },
    pages: [
      {
        id: 'page-1',
        name: 'Home',
        sections: [
          {
            id: 'sec-hero',
            role: 'hero',
            confidence: 0.95,
            children: [
              {
                id: 'head-1',
                kind: 'heading',
                text: 'Welcome to Antigravity',
                level: 1,
                confidence: 0.98,
              },
            ],
          },
        ],
      },
    ],
  };

  const mockRealShapedGymDir = {
    version: '1.0.0',
    meta: {
      confidenceScore: 0.96,
      analysisModel: 'gemini-3.8-flash',
    },
    globals: {
      colors: {
        background: '#071312',
        text: '#ffffff',
      },
    },
    pages: [
      {
        id: 'page_main',
        name: 'Home',
        sections: [
          {
            id: 'sec_header',
            role: 'header',
            label: 'Main Navigation',
            confidence: 0.96,
            children: [
              {
                id: 'nav_bar_container',
                kind: 'flex-group',
                direction: 'row',
                children: [
                  {
                    id: 'brand_logo_group',
                    kind: 'flex-group',
                    children: [
                      {
                        id: 'brand_logo_image',
                        kind: 'image',
                        alt: 'Strong Body Logo',
                        assetId: 'asset_logo_mark',
                      },
                    ],
                  },
                  {
                    id: 'nav_menu_links',
                    kind: 'flex-group',
                    children: [
                      { id: 'link_1', kind: 'link', text: 'Home' },
                      { id: 'link_2', kind: 'link', text: 'Services' },
                      { id: 'link_3', kind: 'link', text: 'About' },
                      { id: 'link_4', kind: 'link', text: 'Training' },
                      { id: 'link_5', kind: 'link', text: 'Features' },
                      { id: 'link_6', kind: 'link', text: 'Pricing' },
                    ],
                  },
                  {
                    id: 'btn_join',
                    kind: 'button',
                    text: 'Join Now',
                  },
                ],
              },
            ],
          },
          {
            id: 'sec_hero',
            role: 'hero',
            label: 'Hero Section',
            confidence: 0.98,
            children: [
              {
                id: 'hero_content_grid',
                kind: 'grid-group',
                columns: 2,
                children: [
                  {
                    id: 'hero_text_column',
                    kind: 'flex-group',
                    children: [
                      { id: 'h1', kind: 'heading', level: 1, text: 'Build a perfect life' },
                      { id: 'p1', kind: 'text', text: 'Fitness description copy' },
                      { id: 'cta_btn', kind: 'button', text: 'Start Now' },
                    ],
                  },
                  {
                    id: 'hero_visual_column',
                    kind: 'container',
                    children: [
                      { id: 'hero_img', kind: 'image', alt: 'Male athlete training in gym', assetId: 'asset_hero_athlete' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const mockElementor = {
    version: '0.4',
    title: 'Exported Template',
    type: 'page',
    content: [
      {
        id: 'c1001',
        elType: 'container',
        settings: {
          container_type: 'flex',
          flex_direction: 'column',
        },
        elements: [
          {
            id: 'w1001',
            elType: 'widget',
            widgetType: 'heading',
            settings: {
              title: 'Welcome to Antigravity',
              header_size: 'h1',
            },
          },
        ],
      },
    ],
  };

  describe('DIRInspector', () => {
    it('renders empty state when data is null', () => {
      const { getByText } = render(<DIRInspector dirData={null} />);
      expect(getByText(/No DIR JSON artifact available yet/i)).toBeDefined();
    });

    it('renders tree and raw JSON tabs for valid DIR data', () => {
      const { getByText } = render(<DIRInspector dirData={mockDir} />);
      expect(getByText('Tree')).toBeDefined();
      expect(getByText('JSON')).toBeDefined();

      // Switch to Raw JSON view
      fireEvent.click(getByText('JSON'));
      expect(document.querySelector('pre')).toBeDefined();
    });

    it('displays non-zero recursive element counts for canonical DIRDocument with section.children', () => {
      const { getByText } = render(<DIRInspector dirData={mockDir} />);
      // Should show 1 element, NOT 0 elements
      expect(getByText('1 element')).toBeDefined();
      // Should render the heading text
      expect(getByText('"Welcome to Antigravity"')).toBeDefined();
    });

    it('accurately counts and recursively renders real-shaped nested DIR hierarchies', () => {
      const { getByText } = render(<DIRInspector dirData={mockRealShapedGymDir} />);

      // Header section has 1 nav_bar_container + 2 child groups + 1 logo image + 6 links + 1 button = 11 elements
      expect(getByText('11 elements')).toBeDefined();

      // Hero section has 1 grid + 2 columns + (1 h1 + 1 text + 1 button) + (1 img) = 7 elements
      expect(getByText('7 elements')).toBeDefined();

      // Total elements badge on page header (11 + 7 = 18)
      expect(getByText('18 Elements')).toBeDefined();

      // Key nested nodes should be rendered in the tree
      expect(getByText('"Join Now"')).toBeDefined();
      expect(getByText('"Build a perfect life"')).toBeDefined();
      expect(getByText('asset_logo_mark')).toBeDefined();
      expect(getByText('asset_hero_athlete')).toBeDefined();
    });
  });

  describe('ElementorInspector', () => {
    it('renders empty state when data is null', () => {
      const { getByText } = render(<ElementorInspector elementorData={null} />);
      expect(getByText(/No Elementor JSON artifact generated yet/i)).toBeDefined();
    });

    it('renders container tree and raw JSON tabs', () => {
      const { getByText } = render(<ElementorInspector elementorData={mockElementor} />);
      expect(getByText('Tree')).toBeDefined();
      expect(getByText('JSON')).toBeDefined();

      // Switch to Raw JSON view
      fireEvent.click(getByText('JSON'));
      expect(document.querySelector('pre')).toBeDefined();
    });
  });
});
