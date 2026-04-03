import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarkdownDisplay } from './MarkdownDisplay';

describe('MarkdownDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders content immediately when animate is false', () => {
    render(<MarkdownDisplay content="# Hello World" animate={false} />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('animates text over time when animate is true', () => {
    const content = "Test animation.";
    render(<MarkdownDisplay content={content} animate={true} />);
    
    // Initially should not have the full text, assuming it adds 2-4 chars
    expect(screen.queryByText(content)).not.toBeInTheDocument();

    // Fast forward time
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should now be fully rendered
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('calls onAnimationComplete when animation finishes', () => {
    const onComplete = vi.fn();
    render(<MarkdownDisplay content="XYZ" animate={true} onAnimationComplete={onComplete} />);
    
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
