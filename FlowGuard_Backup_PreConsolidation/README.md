# FlowGuard AI
**AI-Based Urban Traffic Congestion Analyzer & Signal Timing Recommendation**

[![Domain](https://img.shields.io/badge/Domain-Civil%20%2F%20Transportation%20Engineering-06b6d4)](#)
[![Status](https://img.shields.io/badge/Prototype-Data--Driven%20LHT%20Lanes%20Validated-10b981)](#)
[![Stack](https://img.shields.io/badge/Tech-HTML5%20%7C%20CSS3%20%7C%20JavaScript-38bdf8)](#)

---

> [!IMPORTANT]
> **ENGINEERING GUARDRAILS & DISCLAIMER**  
> *FlowGuard AI is an offline traffic-analysis and signal-timing decision-support prototype tailored for Indian urban traffic conditions. Recommendations require validation by qualified traffic engineers before field implementation. All performance metrics represent estimated improvements under simulation assumptions. The optimization engine is a deterministic Civil Engineering search algorithm, NOT machine learning or AI.*

---

## 📌 Project Overview

FlowGuard AI is an offline decision-support platform engineered for civil and transportation engineers to analyze intersection traffic demand, identify congestion bottlenecks, evaluate candidate signal green-time allocations via bounded optimization search, and evaluate signal performance across multi-cycle deterministic simulations.

### Key Capabilities & Data-Driven Schematic Enhancements (Indian LHT Standards)

1. **Configurable 1, 2, and 3-Lane Carriageway Support**:
   - Allows independent selection of **1, 2, or 3 lanes PER DIRECTION** for each active approach leg.
   - **1 Lane**: 1 IN lane + 1 OUT lane (visual 2 lanes total on 2-way road). Trajectories originate from single IN lane and split inside junction.
   - **2 Lanes**: 2 IN lanes + 2 OUT lanes (visual 4 lanes total on 2-way road).
   - **3 Lanes**: 3 IN lanes + 3 OUT lanes (visual 6 lanes total on 2-way road).
2. **Permanent White Directional Arrows & Labels**:
   - Permanent **WHITE arrows** and `IN` / `OUT` text labels rendered on every active carriageway:
     - North (Road A): `OUT ↑` (right) | `IN ↓` (left)
     - East (Road B): `IN ←` (top) | `OUT →` (bottom)
     - South (Road C): `IN ↑` (right) | `OUT ↓` (left)
     - West (Road D): `IN →` (bottom) | `OUT ←` (top)
3. **Data-Driven Turning Movement Trajectories**:
   - Every turning path starts on an **INBOUND carriageway**, curves through the junction box, and finishes on an **OUTBOUND carriageway** with a destination arrowhead pointing in destination travel direction.
4. **Engineering Input Validation Engine**:
   - Enforces lane count $\in [1, 2, 3]$.
   - Validates non-negative movement flows and conservation ($q_{total} = q_L + q_T + q_R$).
   - Validates destination approach active status (inactive destination $\implies$ `N/A — Destination unavailable`).
5. **Interactive Approach & Movement Filter Toolbar**:
   - Origin Filter Buttons: `[ Show All ]` `[ North ]` `[ East ]` `[ South ]` `[ West ]`
   - Movement Filter Buttons: `[ All Movements ]` `[ L - Left ]` `[ T - Through ]` `[ R - Right ]`

---

## 🧪 Automated Test Suite Verification Results (`scratch/test_milestone_lht_lanes.js`)

All 8 mandatory test cases were evaluated using the automated verification suite:

| Test Case | Description | Geometry Config | Active Arms | Valid Trajectories | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TEST 1** | 4-Arm Cross — All Approaches = 1 Lane | `4CROSS` | 4 Arms | 12 Trajectories | **PASS** |
| **TEST 2** | 4-Arm Cross — All Approaches = 2 Lanes | `4CROSS` | 4 Arms | 12 Trajectories | **PASS** |
| **TEST 3** | 4-Arm Cross — All Approaches = 3 Lanes | `4CROSS` | 4 Arms | 12 Trajectories | **PASS** |
| **TEST 4** | Mixed 4-Arm — N=3, E=2, S=1, W=2 | `4CROSS` | 4 Arms | 12 Trajectories | **PASS** |
| **TEST 5** | 3-Arm No East — N=2, S=1, W=3 | `3NO_EAST` | 3 Arms | 6 Trajectories | **PASS** |
| **TEST 6** | 3-Arm No West — N=2, E=3, S=1 | `3NO_WEST` | 3 Arms | 6 Trajectories | **PASS** |
| **TEST 7** | 3-Arm No North — E=2, S=2, W=2 | `3NO_NORTH` | 3 Arms | 6 Trajectories | **PASS** |
| **TEST 8** | 3-Arm No South — N=1, E=2, W=3 | `3NO_SOUTH` | 3 Arms | 6 Trajectories | **PASS** |

**FINAL VERIFICATION OUTCOME**: **ALL 8 MANDATORY TEST CASES PASSED (8/8)**.

---

## 🚀 Local Running Instructions

Launch HTTP server on port 8081:

```bash
# Python 3:
python -m http.server 8081

# Node:
npx http-server ./ -p 8081
```

Access at: **`http://localhost:8081`**
