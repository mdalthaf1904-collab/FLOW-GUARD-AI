# FlowGuard AI — Offline Traffic Engineering Decision Support System

[![Domain](https://img.shields.io/badge/Domain-Civil%20%2F%20Transportation%20Engineering-06b6d4)](#)
[![Status](https://img.shields.io/badge/Scope-Offline%20Decision%20Support-10b981)](#)
[![Security](https://img.shields.io/badge/Security-Helmet%20%7C%20RateLimit%20%7C%20CORS-38bdf8)](#)
[![Testing](https://img.shields.io/badge/Testing-Jest%20%7C%20Supertest%20100%25-10b981)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

> [!IMPORTANT]
> **ENGINEERING GUARDRAILS & SYSTEM DISCLAIMER**  
> *FlowGuard AI is an offline traffic-analysis, signal-timing optimization, and simulation decision-support system. Recommendations are grounded in Indian Roads Congress standards (IRC:93-1985, IRC:106-1990) and require validation by qualified traffic engineers before field implementation. FlowGuard AI does not directly control real-world traffic signals.*

---

## 📌 Executive Summary

**FlowGuard AI** is an enterprise-grade, offline **Traffic Engineering Decision Support System (DSS)** designed to diagnose urban traffic bottlenecks, calculate Webster's Optimum Signal Cycle length, validate timing plans against Indian Roads Congress (IRC:93) safety guidelines, and execute multi-cycle deterministic queuing simulations ($D/D/1$ arrival-discharge modeling).

### Core Engineering Capabilities

1. **IRC:106-1990 PCU Conversion**: Converts heterogeneous vehicle compositions (Cars, Motorcycles, Auto-Rickshaws, Buses, LCVs, Trucks, Bicycles) into standardized Passenger Car Units (PCU/h).
2. **IRC:93 Saturation Flow Analysis**: Computes approach saturation flow ($S = 525 \cdot W$, PCU/h) and critical flow ratios ($y_i = q_i / S_i$).
3. **Webster Optimum Cycle Optimization**: Calculates optimum cycle lengths ($60\text{s} \le C_{\text{opt}} \le 180\text{s}$) and allocates proportional green splits based on approach demand.
4. **Stage 2 IRC:93 Validation Guardrail**: Enforces minimum vehicular green ($g_{\text{min}} \ge 7\text{s}$), maximum green ($g_{\text{max}} \le 90\text{s}$), yellow interval ($Y \ge 3\text{s}$), all-red interval ($AR \ge 2\text{s}$), pedestrian walk time ($t_{\text{ped}} = 7.0 + W / 1.2$), and zero simultaneous green phase conflicts.
5. **Deterministic D/D/1 Queuing Simulation**: Evaluates cycle-by-cycle queue buildup, queue clearance times, and control delay reductions comparing baseline vs candidate signal timing plans.
6. **Professional 15-Section Printable Engineering Report**: Generates complete civil engineering documentation with step-by-step mathematical proofs.

---

## 🏗️ System Architecture & Workflow

```
┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│  1. Manual Traffic      │ ───► │  2. IRC:106 PCU         │ ───► │  3. Saturation Flow     │
│     Survey Input        │      │     Conversion          │      │     Analysis            │
└─────────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                                                                               │
┌─────────────────────────┐      ┌─────────────────────────┐                   ▼
│  6. Deterministic D/D/1 │ ◄─── │  5. Stage 2 IRC:93      │ ◄─── ┌─────────────────────────┐
│     Queue Simulation    │      │     Engineering Check   │      │  4. Webster Optimum     │
└─────────────────────────┘      └─────────────────────────┘      │     Cycle Optimization  │
             │                                                    └─────────────────────────┘
             ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│  7. Controller Decision │ ───► │  8. 15-Section Printable│
│     Transparency        │      │     Engineering Report  │
└─────────────────────────┘      └─────────────────────────┘
```

---

## 📂 Repository Folder Structure

```
FLOW-GUARD-AI/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI/CD pipeline
├── config/                      # System environment configurations
├── css/
│   └── styles.css               # Master Dark Mode CSS Design System (--bg-app: #0B1121)
├── docs/
│   ├── ARCHITECTURE.md          # 7-Stage Civil Engineering Architecture & Math Formulas
│   ├── API_DOCUMENTATION.md     # Complete REST API specification
│   └── DEVELOPER_GUIDE.md       # Local Setup & Contribution Guide
├── js/
│   ├── app.js                   # Master App Module, UI Forms & Event Listener Repair Suite
│   ├── analysis.js              # Traffic Engineering Analysis & Webster Optimizer
│   ├── congestion.js            # IRC:106 PCU Math & IRC:93 Validation Engine
│   ├── controller.js            # Signal Controller Logic & Emergency Priority Mode
│   ├── simulation.js            # Deterministic D/D/1 Queuing Simulation Engine
│   └── validation.js            # 9-Scenario Deterministic Automated Test Engine
├── pages/
│   ├── analysis.html            # Engineering Analysis Dashboard
│   ├── controller.html          # Signal Controller Decision Flow Visualizer
│   ├── dashboard.html           # Historical Analytics Dashboard
│   ├── simulation.html          # D/D/1 Queuing & Pedestrian Active State Visualizer
│   └── validation.html          # Automated Test Suite Verification Console
├── server/
│   ├── config/
│   │   └── env.js               # Environment configuration & runtime validation
│   ├── controllers/
│   │   ├── aiController.js      # Azure OpenAI LLM Rationale Generation
│   │   ├── analyticsController.js # Analytics & Webster Calculation REST APIs
│   │   └── simulationController.js # D/D/1 Simulation REST API
│   ├── middleware/
│   │   ├── errorHandler.js      # Centralized Error & 404 Handling Middleware
│   │   └── validateRequest.js   # API Payload Validation & Sanitization Middleware
│   ├── routes/
│   │   └── api.js               # Express API Gateway Router
│   ├── utils/
│   │   └── logger.js            # Structured Application Winston Logger
│   └── index.js                 # Express Backend Entrypoint & Security Stack
├── tests/
│   ├── api.test.js              # Supertest REST API Integration Tests
│   └── engine.test.js           # Civil Engineering Math Unit Tests
├── .env.example                 # Environment variables template
├── index.html                   # High-Fidelity Master Intersection Analysis Wizard
├── LICENSE                      # MIT Open Source License
└── package.json                 # Node.js Dependencies & NPM Scripts
```

---

## ⚡ Local Setup & Running Instructions

### 1. Requirements
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher

### 2. Installation & Startup

```bash
# 1. Clone the repository
git clone https://github.com/saicharan939/Flowguard.git
cd Flowguard

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Start the Express server
npm start
```

Access the Web Application at [http://localhost:3000](http://localhost:3000).

---

## 🧪 Testing & Code Verification

Run all automated unit and integration tests:

```bash
npm test
```

Generate test coverage report:

```bash
npm run test:coverage
```

### Deterministic Test Suite Results (9 / 9 Passed)

| Test Case | Description | Geometry Config | Active Arms | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TEST 1** | 4-Arm Cross — All Approaches = 1 Lane | `4CROSS` | 4 Arms | **PASS** |
| **TEST 2** | 4-Arm Cross — All Approaches = 2 Lanes | `4CROSS` | 4 Arms | **PASS** |
| **TEST 3** | 4-Arm Cross — All Approaches = 3 Lanes | `4CROSS` | 4 Arms | **PASS** |
| **TEST 4** | Mixed 4-Arm — N=3, E=2, S=1, W=2 | `4CROSS` | 4 Arms | **PASS** |
| **TEST 5** | 3-Arm No East — N=2, S=1, W=3 | `3NO_EAST` | 3 Arms | **PASS** |
| **TEST 6** | 3-Arm No West — N=2, E=3, S=1 | `3NO_WEST` | 3 Arms | **PASS** |
| **TEST 7** | 3-Arm No North — E=2, S=2, W=2 | `3NO_NORTH` | 3 Arms | **PASS** |
| **TEST 8** | 3-Arm No South — N=1, E=2, W=3 | `3NO_SOUTH` | 3 Arms | **PASS** |
| **TEST 9** | Oversaturated Peak — Total Flow > Capacity | `4CROSS` | 4 Arms | **PASS** |

---

## 🔐 Security Architecture

- **Helmet HTTP Headers**: Enforces strict security headers against XSS and clickjacking.
- **Express Rate Limiting**: Protects `/api` endpoints against DDoS and brute-force attacks (default: 200 requests per 15 minutes).
- **Input Validation**: `validateRequest.js` middleware sanitizes and validates incoming payloads.
- **Centralized Error Handling**: Prevents sensitive stack traces from leaking in production (`server/middleware/errorHandler.js`).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
