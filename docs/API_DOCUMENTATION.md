# FlowGuard AI — REST API Documentation

## Base URL
- **Local Server**: `http://localhost:3000/api`
- **Health Check**: `http://localhost:3000/health`

---

## Endpoints

### 1. Health Check
- **GET** `/health`
- **Description**: Verifies backend server health status.
- **Response `200 OK`**:
```json
{
  "status": "UP",
  "service": "FlowGuard AI Backend Engine",
  "version": "2.0.0",
  "environment": "development",
  "timestamp": "2026-08-06T10:00:00.000Z"
}
```

---

### 2. Get Synthetic Historical Traffic Data
- **GET** `/api/data/synthetic`
- **Query Parameters**:
  - `numIntersections` *(optional, default 3)*
  - `numDays` *(optional, default 1)*
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-08-06T08:00:00.000Z",
      "intersectionId": "INT_01",
      "approaches": {
        "north": { "flow": 850, "lanes": 2 },
        "east": { "flow": 700, "lanes": 2 }
      }
    }
  ]
}
```

---

### 3. Analyze Traffic Flow & Congestion
- **POST** `/api/analyze`
- **Description**: Accepts approach flow volumes and returns $v/c$ ratios, saturation flows, and Level of Service (LOS).
- **Request Body**:
```json
{
  "approaches": {
    "north": { "id": "north", "name": "Road A", "flow": 850, "lanes": 2 },
    "east": { "id": "east", "name": "Road B", "flow": 700, "lanes": 2 }
  }
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "approaches": {
      "north": {
        "demand": 850,
        "satFlow": 3675,
        "vcRatio": 0.92,
        "congestionLevel": "SEVERE"
      }
    }
  }
}
```

---

### 4. Optimize Signal Timing (Webster's Formula)
- **POST** `/api/optimize`
- **Description**: Calculates Webster's optimum cycle length and evaluates IRC:93 validation guardrails.
- **Request Body**:
```json
{
  "approaches": {
    "north": { "flow": 850, "lanes": 2 },
    "east": { "flow": 700, "lanes": 2 }
  },
  "config": { "minGreen": 7, "maxGreen": 90 }
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "websterResult": {
      "websterCycle": 120,
      "approaches": {
        "north": { "greenSplit": 42 },
        "east": { "greenSplit": 38 }
      }
    },
    "ircValidation": {
      "overallPassed": true,
      "statusLabel": "ENGINEERING VALIDATED"
    }
  }
}
```

---

### 5. Execute D/D/1 Queuing Simulation
- **POST** `/api/simulate`
- **Description**: Runs deterministic queuing simulation comparing baseline vs candidate signal timing plans.
- **Request Body**:
```json
{
  "approaches": {
    "north": { "flow": 850, "lanes": 2 },
    "east": { "flow": 700, "lanes": 2 }
  },
  "greenAllocation": {
    "north": 42,
    "east": 38
  },
  "config": { "cycleLength": 120, "numCycles": 10 }
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "simulation": {
      "overallAvgWaitTime": 32.1,
      "overallMaxQueue": 34,
      "totalServed": 1420
    }
  }
}
```

---

### 6. Generate AI Rationale (Azure OpenAI)
- **POST** `/api/recommend`
- **Description**: Triggers LLM engineering rationale generation for proposed signal changes.
- **Request Body**:
```json
{
  "beforeMetrics": { "avg_delay_sec": 48.5, "max_queue_length": 58 },
  "afterMetrics": { "avg_delay_sec": 32.1, "max_queue_length": 34 },
  "recommendedSplit": "North: 42s | East: 38s"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "source": "fallback",
  "rationale": "Reallocating green time to peak approaches reduces estimated queue delay by 16.4s/veh and maximum queue length by 24 vehicles under D/D/1 simulation modeling."
}
```
