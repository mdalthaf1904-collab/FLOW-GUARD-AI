# FlowGuard AI — Civil Engineering Architecture & Mathematical Blueprint

## Overview

FlowGuard AI is an **OFFLINE Traffic Engineering Decision Support System (DSS)** designed in accordance with Indian Roads Congress (IRC:93, IRC:106) and Highway Capacity Manual (HCM) standards. It processes heterogeneous traffic counts, evaluates volume-to-capacity ($v/c$) ratios, calculates Webster's optimum cycle length, validates timing guardrails, and deterministically simulates multi-cycle arrival-discharge queuing models.

---

## 7-Stage Offline Decision Support Pipeline

```
[1. Traffic Input] ➔ [2. PCU Conversion] ➔ [3. Saturation Flow Analysis] ➔ [4. Webster Optimization]
                                                                                      │
[7. Report & Rationale] ◄─ [6. D/D/1 Queue Simulation] ◄─ [5. IRC:93 Validation] ◄────┘
```

### Stage 1: Heterogeneous Traffic Input
Accepts physical vehicle counts across 6 vehicle classes ($n_i$):
- Cars / Jeeps / Vans
- Two-Wheelers / Motorcycles
- Auto-Rickshaws
- Buses
- Light Commercial Vehicles (LCV) / Trucks
- Bicycles

### Stage 2: IRC:106-1990 PCU Conversion
Converts heterogeneous counts into Passenger Car Units (PCU/h) using IRC:106 factors ($f_i$):

$$\text{Total PCU} = \sum (n_i \cdot f_i) = (n_{\text{car}} \cdot 1.0) + (n_{\text{bike}} \cdot 0.5) + (n_{\text{auto}} \cdot 0.8) + (n_{\text{bus}} \cdot 3.0) + (n_{\text{truck}} \cdot 3.0) + (n_{\text{bicycle}} \cdot 0.4)$$

### Stage 3: IRC:93 Saturation Flow & Flow Ratio
Calculates approach saturation flow ($S_i$, PCU/h) based on effective carriageway width ($W_i$, meters):

$$S_i = 525 \cdot W_i = 525 \cdot (N_{\text{lanes}} \cdot 3.5\text{m})$$

Calculates approach flow ratio ($y_i$):

$$y_i = \frac{q_i}{S_i}$$

### Stage 4: Webster's Optimum Cycle Length Optimization
Computes total critical flow ratio ($Y = \sum y_i$) and total lost time per cycle ($L = \sum (Y_{\text{amber}} + AR_{\text{all-red}})$). Optimum cycle length ($C_{\text{opt}}$):

$$C_{\text{opt}} = \frac{1.5L + 5}{1 - Y} \quad (60\text{s} \le C_{\text{opt}} \le 180\text{s})$$

Green split allocation ($g_i$):

$$g_i = \frac{y_i}{Y} \cdot (C_{\text{opt}} - L)$$

### Stage 5: Stage 2 IRC:93 Guidelines Engineering Validation
Automated 6-point verification:
1. **Minimum Vehicular Green**: $g_i \ge g_{\text{min}}$ ($7\text{s}$)
2. **Maximum Vehicular Green**: $g_i \le g_{\text{max}}$ ($90\text{s}$)
3. **Yellow Clearance Interval**: $Y \ge 3\text{s}$
4. **All-Red Clearance Interval**: $AR \ge 2\text{s}$
5. **Pedestrian Crossing Time Safety**:

$$t_{\text{ped}} = 7.0 + \frac{W_{\text{crosswalk}}}{1.2\text{ m/s}} \quad \Rightarrow g_i + Y \ge t_{\text{ped}}$$

6. **Conflict-Free Phase Matrix**: Enforces zero simultaneous conflicting green lights.

If any check fails, system outputs `"IRC Validation Failed"` with specific engineering root causes.

### Stage 6: Deterministic D/D/1 Queuing Simulation
Simulates cycle-by-cycle arrival rate ($\lambda = q / 3600$) and green discharge rate ($\mu = S / 3600$).

- Red-phase max queue buildup: $Q = \lambda \cdot R$
- Queue clearance time during green: $t_c = \frac{Q}{\mu - \lambda}$
- Average control delay per vehicle ($d_i$, s/veh) evaluated per HCM thresholds.

### Stage 7: Professional Engineering Report & Controller Decision
Generates 15-section PDF engineering report and outputs transparent recommendations (`RECOMMENDED`, `CONDITIONAL`, `CANDIDATE REJECTED`).
