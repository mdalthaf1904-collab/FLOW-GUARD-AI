# FlowGuard AI — Developer Setup & Contribution Guide

## Environment Setup & Requirements

- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher

---

## Local Installation

1. Clone the repository:
```bash
git clone https://github.com/saicharan939/Flowguard.git
cd Flowguard
```

2. Install dependencies:
```bash
npm install
```

3. Configure Environment Variables:
```bash
cp .env.example .env
```

4. Launch Local Server:
```bash
npm start
```
Server runs on [http://localhost:3000](http://localhost:3000).

---

## Testing & Quality Assurance

Run Jest unit and integration test suite:
```bash
npm test
```

Run test coverage report:
```bash
npm run test:coverage
```

Run npm security vulnerability audit:
```bash
npm run security-check
```

---

## Coding Standards

1. **Vanilla JavaScript**: Keep logic modular, avoid global variable pollution, wrap events in `DOMContentLoaded`.
2. **CSS Formatting**: Use exact `:root` design system variables (`--bg-app`, `--bg-panel`, `--accent-primary`, `--border-radius-lg: 8px`).
3. **API Response Schema**: Every REST endpoint must return `{ success: true|false, data, message, error }`.
4. **Civil Engineering Accuracy**: Enforce IRC:93 and IRC:106 mathematical constants ($S = 525 \cdot W$, $g_{\text{min}} \ge 7\text{s}$, $Y \ge 3\text{s}$, $AR \ge 2\text{s}$).
