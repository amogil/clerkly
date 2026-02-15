/**
 * @jest-environment jsdom
 */

/* Preconditions: MarkdownMessage component with content and format props
   Action: render component with different formats
   Assertions: correct rendering for markdown and text formats
   Requirements: agents.7.7 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarkdownMessage } from '../../../../src/renderer/components/agents/MarkdownMessage';

describe('MarkdownMessage', () => {
  /* Preconditions: Component with text format
     Action: render with plain text
     Assertions: text is rendered as paragraph
     Requirements: agents.7.7 */
  it('should render plain text when format is text', () => {
    render(<MarkdownMessage content="Hello world" format="text" />);
    const paragraph = screen.getByText('Hello world');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph.tagName).toBe('P');
  });

  /* Preconditions: Component with default format (no format prop)
     Action: render without format prop
     Assertions: text is rendered as paragraph (defaults to text)
     Requirements: agents.7.7 */
  it('should default to text format when format is not specified', () => {
    render(<MarkdownMessage content="Default text" />);
    const paragraph = screen.getByText('Default text');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph.tagName).toBe('P');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown heading
     Assertions: markdown wrapper is rendered
     Requirements: agents.7.7 */
  it('should render markdown when format is markdown', () => {
    render(<MarkdownMessage content="# Hello" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent('# Hello');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown bold text
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown bold text', () => {
    render(<MarkdownMessage content="**bold text**" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent('**bold text**');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown italic text
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown italic text', () => {
    render(<MarkdownMessage content="*italic text*" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent('*italic text*');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown link
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown links', () => {
    render(<MarkdownMessage content="[link](https://example.com)" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent('[link](https://example.com)');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown code block
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown code blocks', () => {
    render(<MarkdownMessage content="```\nconst x = 1;\n```" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    // toHaveTextContent normalizes whitespace, so check the actual content
    expect(markdown.textContent).toContain('const x = 1;');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown inline code
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown inline code', () => {
    render(<MarkdownMessage content="`code`" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent('`code`');
  });

  /* Preconditions: Component with markdown format
     Action: render with markdown list
     Assertions: markdown content is passed to ReactMarkdown
     Requirements: agents.7.7 */
  it('should render markdown lists', () => {
    render(<MarkdownMessage content="- item 1\n- item 2" format="markdown" />);
    const markdown = screen.getByTestId('react-markdown');
    expect(markdown).toBeInTheDocument();
    // toHaveTextContent normalizes whitespace, so check both items separately
    expect(markdown.textContent).toContain('item 1');
    expect(markdown.textContent).toContain('item 2');
  });

  /* Preconditions: Component with text format and newlines
     Action: render with text containing newlines
     Assertions: newlines are preserved with whitespace-pre-wrap
     Requirements: agents.7.7 */
  it('should preserve newlines in text format', () => {
    const { container } = render(<MarkdownMessage content="Line 1\nLine 2" format="text" />);
    const paragraph = container.querySelector('p');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).toHaveClass('whitespace-pre-wrap');
    // In the DOM, \n is preserved as literal \n in textContent
    expect(paragraph?.textContent).toContain('Line 1');
    expect(paragraph?.textContent).toContain('Line 2');
  });

  /* Preconditions: Component with empty content
     Action: render with empty string
     Assertions: component renders without errors
     Requirements: agents.7.7 */
  it('should handle empty content', () => {
    const { container } = render(<MarkdownMessage content="" format="text" />);
    const paragraph = container.querySelector('p');
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).toHaveTextContent('');
  });

  /* Preconditions: Component with markdown format
     Action: render with prose styling classes
     Assertions: ReactMarkdown has correct prose classes
     Requirements: agents.7.7 */
  it('should apply prose styling to markdown', () => {
    const { container } = render(<MarkdownMessage content="# Test" format="markdown" />);
    const markdown = container.querySelector('.prose');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveClass('prose-sm');
    expect(markdown).toHaveClass('max-w-none');
  });
});
