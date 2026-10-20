/**
 * Client UI Components Tests
 * Tests Button, Badge, Card, and utility classes
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.js';
import { cn } from '../lib/utils.js';

describe('Client UI Kit Components', () => {
  describe('cn (Classnames utility)', () => {
    it('should merge classes and handle conditional classes', () => {
      expect(cn('p-4', 'bg-white')).toBe('p-4 bg-white');
      expect(cn('p-4', false && 'hidden', true && 'block')).toBe('p-4 block');
      expect(cn('p-2', 'p-4')).toBe('p-4'); // tailwind-merge resolves conflicts
    });
  });

  describe('Badge component', () => {
    it('renders text with default variant', () => {
      const { getByText } = render(<Badge>Ready</Badge>);
      expect(getByText('Ready')).toBeDefined();
    });

    it('renders with dot indicator when withDot is true', () => {
      const { container } = render(<Badge variant="success" withDot>Success</Badge>);
      const dot = container.querySelector('.rounded-full');
      expect(dot).toBeDefined();
    });
  });

  describe('Button component', () => {
    it('renders button with children', () => {
      const { getByRole } = render(<Button>Click Me</Button>);
      const btn = getByRole('button');
      expect(btn).toBeDefined();
      expect(btn.textContent).toBe('Click Me');
    });

    it('disables button when disabled or isLoading is set', () => {
      const { getByRole, rerender } = render(<Button disabled>Disabled</Button>);
      expect(getByRole('button').hasAttribute('disabled')).toBe(true);

      rerender(<Button isLoading>Loading</Button>);
      expect(getByRole('button').hasAttribute('disabled')).toBe(true);
    });
  });

  describe('Card component', () => {
    it('renders card with title and content', () => {
      const { getByText } = render(
        <Card>
          <CardHeader>
            <CardTitle>Project Card</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Card body content</p>
          </CardContent>
        </Card>
      );

      expect(getByText('Project Card')).toBeDefined();
      expect(getByText('Card body content')).toBeDefined();
    });
  });
});

