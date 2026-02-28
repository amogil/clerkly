import React from 'react';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInline = (value: string) => {
  let text = escapeHtml(value);
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\$\$([^\n]+?)\$\$/g, '<span class="katex">$1</span>');
  text = text.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
  text = text.replace(
    /(^|\s)([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    '$1<a href="mailto:$2">$2</a>'
  );
  return text;
};

const renderMockMarkdown = (markdown: string) => {
  const blocks: string[] = [];
  let source = markdown.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    if (lang === 'mermaid') {
      blocks.push('<svg data-mermaid="true"></svg>');
    } else {
      const className = lang ? ` class="language-${lang}"` : '';
      blocks.push(`<pre><code${className}>${escapeHtml(code)}</code></pre>`);
    }
    return `@@BLOCK_${blocks.length - 1}@@`;
  });

  source = source.replace(/\$\$\s*\n([\s\S]*?)\n\$\$/g, (_match, equation) => {
    blocks.push(`<div class="katex-display">${escapeHtml(equation)}</div>`);
    return `@@BLOCK_${blocks.length - 1}@@`;
  });

  const lines = source.split('\n');
  const htmlParts: string[] = [];
  const listStack: Array<{ type: 'ul' | 'ol'; indent: number; openItem: boolean }> = [];

  const closeListItem = () => {
    const current = listStack[listStack.length - 1];
    if (current?.openItem) {
      htmlParts.push('</li>');
      current.openItem = false;
    }
  };

  const closeListsToIndent = (indent: number) => {
    while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
      closeListItem();
      const list = listStack.pop();
      if (list) {
        htmlParts.push(`</${list.type}>`);
      }
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.trim() === '') {
      closeListsToIndent(0);
      continue;
    }

    const blockMatch = line.match(/^@@BLOCK_(\d+)@@$/);
    if (blockMatch) {
      closeListsToIndent(0);
      htmlParts.push(blocks[Number(blockMatch[1])] ?? '');
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeListsToIndent(0);
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeListsToIndent(0);
      htmlParts.push('<hr />');
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      closeListsToIndent(0);
      htmlParts.push(`<blockquote>${formatInline(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^(\s*\|?[-: ]+\|)+\s*$/.test(lines[index + 1])
    ) {
      closeListsToIndent(0);
      const headerCells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => `<th>${formatInline(cell.trim())}</th>`)
        .join('');
      index += 2;
      const bodyRows: string[] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        const rowCells = lines[index]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => `<td>${formatInline(cell.trim())}</td>`)
          .join('');
        bodyRows.push(`<tr>${rowCells}</tr>`);
        index += 1;
      }
      index -= 1;
      htmlParts.push(
        `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows.join('')}</tbody></table>`
      );
      continue;
    }

    const listMatch = line.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const isOrdered = listMatch[2] !== '-';
      const type: 'ul' | 'ol' = isOrdered ? 'ol' : 'ul';
      const taskMatch = listMatch[3].match(/^\[([ xX])\]\s+(.*)$/);

      while (listStack.length && indent < listStack[listStack.length - 1].indent) {
        closeListsToIndent(listStack[listStack.length - 1].indent);
      }

      if (!listStack.length || indent > listStack[listStack.length - 1].indent) {
        htmlParts.push(`<${type}>`);
        listStack.push({ type, indent, openItem: false });
      } else if (listStack[listStack.length - 1].type !== type) {
        closeListsToIndent(indent + 1);
        htmlParts.push(`<${type}>`);
        listStack.push({ type, indent, openItem: false });
      } else {
        closeListItem();
      }

      const checkbox = taskMatch
        ? `<input type="checkbox"${taskMatch[1].toLowerCase() === 'x' ? ' checked' : ''} /> `
        : '';
      const content = formatInline(taskMatch ? taskMatch[2] : listMatch[3]);
      htmlParts.push(`<li>${checkbox}${content}`);
      listStack[listStack.length - 1].openItem = true;
      continue;
    }

    closeListsToIndent(0);
    htmlParts.push(`<p>${formatInline(line)}</p>`);
  }

  closeListsToIndent(0);

  return htmlParts.join('');
};

export const Message = ({ children, className, ...props }: React.ComponentProps<'div'>) => (
  <div className={className} {...props}>
    {children}
  </div>
);
export const MessageContent = ({ children, ...props }: React.ComponentProps<'div'>) => (
  <div {...props}>{children}</div>
);
export const MessageResponse = ({ children }: { children?: React.ReactNode }) => {
  const markdown = typeof children === 'string' ? children : '';
  return <div dangerouslySetInnerHTML={{ __html: renderMockMarkdown(markdown) }} />;
};
export const MessageActions = ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>;
export const MessageAction = ({ children }: React.ComponentProps<'button'>) => (
  <button>{children}</button>
);
export const MessageToolbar = ({ children }: React.ComponentProps<'div'>) => <div>{children}</div>;
