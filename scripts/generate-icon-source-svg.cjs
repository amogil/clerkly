#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    jsx: 'react-jsx',
  },
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Logo } = require('../src/renderer/components/logo.tsx');

const outputPath = path.resolve(__dirname, '../assets/icon-source.svg');

const logoMarkup = renderToStaticMarkup(
  React.createElement(Logo, {
    showText: false,
    animated: false,
    iconSizePx: 1024,
    backgroundShape: 'rounded-rect',
    outerScale: 0.83765625,
    symbolScale: 1.2,
  }),
);

const svgMatch = logoMarkup.match(/<svg[\s\S]*<\/svg>/);
if (!svgMatch) {
  throw new Error('Failed to extract SVG from Logo component markup');
}

fs.writeFileSync(outputPath, `${svgMatch[0]}\n`, 'utf8');
console.log(`Generated ${outputPath} from src/renderer/components/logo.tsx`);
