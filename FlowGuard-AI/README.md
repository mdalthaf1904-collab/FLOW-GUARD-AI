# FlowGuard AI
**Offline Traffic Signal Analysis, Recommendation & Simulation System**

[![Domain](https://img.shields.io/badge/Domain-Civil%20%2F%20Transportation%20Engineering-06b6d4)](#)
[![Status](https://img.shields.io/badge/Scope-Offline%20Decision%20Support-10b981)](#)
[![Stack](https://img.shields.io/badge/Tech-HTML5%20%7C%20CSS3%20%7C%20JavaScript-38bdf8)](#)

---

> [!IMPORTANT]
> **ENGINEERING GUARDRAILS & DISCLAIMER**  
> *FlowGuard AI is an academic prototype intended for offline traffic analysis, simulation, and decision support. Simulation results depend on the entered data and simplified model assumptions and are not a substitute for field validation or approved traffic-signal design procedures. FlowGuard AI does not directly control real-world traffic signals.*

---

## 📌 Project Definition & Scope

FlowGuard AI is an offline traffic signal analysis, recommendation, and simulation system. It analyzes manually entered traffic data, evaluates existing signal performance, generates candidate signal timings, compares current and proposed plans through simulation, and provides decision-support recommendations.

**FlowGuard AI does not directly control real-world traffic signals.**

### System Scope Breakdown

#### 1. CURRENT SYSTEM SCOPE (Implemented)
- **Offline Traffic Analysis**: Computes approach PCU counts (IRC:106 factors), movement distribution, capacity ($c_i$), volume-to-capacity ratio ($v/c$), and approach delay ($d_i$).
- **Signal Timing Optimization**: Bounded grid search algorithm generating candidate green-time allocations to minimize overall system vehicle delay.
- **Deterministic D/D/1 Simulation**: Multi-cycle queuing simulation evaluating queue accumulation and wait-time savings comparing baseline vs candidate timing plans.
- **Decision-Support Recommendation Engine**: Automated acceptance checks (`RECOMMENDED`, `CONDITIONAL`, `NOT RECOMMENDED`) with detailed engineering explanations ("Why This Timing?").

#### 2. PROTOTYPE DEMONSTRATION SCOPE (Software Simulation)
- **Signal Operation Simulation**: Software animation demonstrating how green/yellow/red phase transitions operate under selected timing plans on screen.
- **Simulated Emergency Vehicle Priority (EVP)**: Manually triggered priority requests for prototype evaluation (no hardware preemption or automatic detection).
- **Prototype Adaptive Recovery**: Algorithmic approach prioritization following emergency holds based on simulated Queue, Waiting, and Pressure scores.

#### 3. FUTURE SCOPE (Not Currently Implemented)
- **Miniature Model Integration**: Future work may connect FlowGuard's simulated signal-state output to a miniature ESP32-based traffic-light model for demonstration purposes.
- **Connected Field Sensors**: Physical camera/sensor integration or real-time connected controller interfaces.

---

## 🔄 Compact Offline System Workflow

```
MANUAL TRAFFIC INPUT
       ↓
TRAFFIC ANALYSIS
       ↓
SIGNAL TIMING OPTIMIZATION
       ↓
SIMULATION
       ↓
CURRENT VS CANDIDATE COMPARISON
       ↓
VALIDATION
       ↓
RECOMMENDATION
       ↓
PROTOTYPE SIGNAL / EVP DEMONSTRATION
```

---

## 🚦 Key Capabilities & Data-Driven Schematic Enhancements (Indian LHT Standards)

1. **Configurable 1, 2, and 3-Lane Carriageway Support**:
   - Independent selection of **1, 2, or 3 lanes PER DIRECTION** for active approach legs.
   - **1 Lane**: 1 IN lane + 1 OUT lane.
   - **2 Lanes**: 2 IN lanes + 2 OUT lanes.
   - **3 Lanes**: 3 IN lanes + 3 OUT lanes.
2. **Permanent White Directional Arrows & Labels**:
   - Base carriageways with `IN` / `OUT` text and directional arrows according to Indian Left-Hand Traffic (LHT).
3. **Data-Driven Turning Movement Trajectories**:
   - Trajectories curve through junction box from inbound to outbound carriageways with destination arrowheads.
4. **Engineering Input Validation Engine**:
   - Enforces lane count $\in [1, 2, 3]$ and non-negative volume conservation ($q_{total} = q_L + q_T + q_R$).

---

## 🧪 Verification Results

All 8 mandatory geometric test cases pass automated verification:

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

---

## 🚀 Local Running Instructions

Launch local HTTP server on port 8081:

```bash
# PowerShell / Command Line:
powershell -ExecutionPolicy Bypass -File .\server.ps1

# Python 3 alternative:
python -m http.server 8081
```

Access at: **`http://localhost:8081`**
