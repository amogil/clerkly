#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const sourcePath = process.argv[2] ?? 'assets/icon-source.svg';
const outputPath = process.argv[3] ?? 'assets/icon-source.png';
const size = Number.parseInt(process.argv[4] ?? '1024', 10);

const svg = await readFile(sourcePath, 'utf8');
const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><style>html,body{margin:0;padding:0;background:transparent;}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outputPath, omitBackground: true });
} finally {
  await browser.close();
}
