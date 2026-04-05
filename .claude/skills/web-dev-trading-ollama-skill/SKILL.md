---
name: web-dev-trading-ollama
description: Builds lightweight JavaScript/HTML webapps, integrates Ollama AI, and creates stock/options trading analytics dashboards. Use when user asks to "build webapp", "create trading dashboard", "Ollama JS integration", "lightweight JS app", or "stock options analyzer".
metadata:
  author: Perplexity Assistant
  version: 1.0.0
  topics: [web-development, javascript, ollama, trading, finance]
---\n\n
# Web Dev, Ollama & Trading Analytics Skill

## Overview
This skill helps you rapidly prototype lightweight webapps using vanilla JS/HTML/CSS, integrate local Ollama AI models, and build interactive stock/options trading analytics tools. Perfect for VSCode/GitHub workflows, quick MVPs, and personal finance dashboards.

Use this skill when:
- Building simple interactive webapps (no heavy frameworks)
- Integrating Ollama APIs into browser apps
- Creating trading charts, options calculators, P/L trackers
- Prototyping in VSCode for GitHub deployment

## Core Instructions

### 1. Lightweight Webapps (JS/HTML)
- Use vanilla JS, no frameworks (unless specified)
- Structure: index.html + style.css + app.js
- Responsive design with CSS Grid/Flexbox
- htmx/Alpine.js for interactivity if needed (<14kB)
- Focus on single-page apps (SPAs) under 100kB total

### 2. Ollama Integration
- Assume Ollama running on localhost:11434
- Use fetch() for /api/generate or /api/chat
- Handle streaming responses with ReadableStream
- Models: llama3.1, phi3, mistral (suggest based on use)
- CORS: Use proxy or browser extension if needed

Example Ollama fetch:
```javascript
async function queryOllama(prompt, model='llama3.1') {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      model, prompt, stream: false
    })
  });
  return response.json();
}
```

### 3. Trading Analytics
- Free APIs: Alpha Vantage, Finnhub (free tier), Yahoo Finance (unofficial)
- Charts: Chart.js (lightweight), Lightweight Charts (TradingView)
- Options: Black-Scholes calculator, Greeks computation
- Data: Real-time quotes, historical, options chains
- Indicators: SMA, EMA, RSI, MACD (implement or Chart.js)

Key libraries (CDN):
- Chart.js: https://cdn.jsdelivr.net/npm/chart.js
- Lightweight Charts: https://unpkg.com/lightweight-charts
- PapaParse for CSV import

### 4. VSCode/GitHub Workflow
- Generate complete project structure ready for `git init`
- Include .gitignore, README.md, package.json (if npm)
- VSCode settings: .vscode/settings.json for extensions
- Deployment: GitHub Pages, Netlify, Vercel

## Step-by-Step Process
1. **Clarify requirements**: App purpose, features, data sources
2. **Choose stack**: Vanilla/htmx + Chart.js + Ollama
3. **Generate code**: Full files with comments
4. **Test plan**: Local server (Live Server ext), Ollama running
5. **Package**: ZIP or GitHub repo instructions

## Examples

### Example 1: Ollama Chat Webapp
User: "Build simple Ollama chat UI"
Output: Chat interface connected to localhost:11434, model selector, streaming responses.

### Example 2: SPY Options Dashboard
User: "Trading dashboard for SPY options"
Output: Real-time quotes, options chain table, P/L calculator, Chart.js candlesticks.

### Example 3: AI Stock Analyzer
User: "Webapp that analyzes stocks with Ollama"
Output: Input ticker → Fetch data → Ollama sentiment → Trading signals.

## Tools & Resources
Reference these for implementation:

**references/web-best-practices.md**: JS patterns, perf tips
**references/ollama-js.md**: Full integration examples
**references/trading-apis.md**: API keys, endpoints
**assets/templates/**: Boilerplate HTML/JS starters

## Troubleshooting
- Ollama not responding: Check `ollama list`, port 11434
- CORS errors: Use VSCode Live Server or proxy
- API limits: Alpha Vantage 5/min free, suggest alternatives
- Chart.js not loading: CDN fallback to local

## Quality Checklist
- [ ] Mobile responsive
- [ ] Error handling (API fails, no Ollama)
- [ ] Loading states
- [ ] Dark mode toggle
- [ ] Accessible (ARIA labels)
- [ ] <100kB total size
