# FlowGuard AI - Pitch Deck & Overview

## Slide 1: Problem Definition
**The Challenge**
- Traffic congestion is growing exponentially in urban centers, leading to increased emissions and economic loss.
- Current intersection signal timings are often static, outdated, and reliant on manual, time-consuming surveys.
- Implementing fully autonomous, real-time adaptive systems is prohibitively expensive for many municipalities and carries significant safety and compliance risks.

## Slide 2: The Solution - FlowGuard AI
**An Offline Decision-Support Prototype**
- **Data-Driven & Cost-Effective:** Ingests historical traffic data (CSV) or uses synthetic modeling to identify hidden bottlenecks.
- **Human-in-the-Loop AI:** Provides automated green-split recommendations powered by deterministic civil engineering models (D/D/1 queuing theory), augmented with human-readable rationale via Azure OpenAI.
- **Simulated "What-If" Prototyping:** Allows traffic engineers to safely simulate new signal timings offline and verify their impact on queue lengths and vehicle delays before ever touching a real-world controller.

## Slide 3: System Architecture
**Lightweight, Vanilla Web Technology**
- **Frontend & UI:** 100% HTML5, CSS3 (Flexbox/Grid), and Vanilla JS. Zero heavy frontend frameworks.
- **Core JavaScript Engines:**
  - `analysis.js`: Calculates PCU and capacity limits (IRC standards).
  - `congestion.js`: Evaluates Level-of-Service (LOS) and flags peak severity.
  - `simulation.js`: Executes the D/D/1 queuing math.
  - `controller.js`: The recommendation ruleset and AI REST API client.
- **Multilingual (i18n):** Native support for English and Telugu (`i18n.js`) for localized municipal use.

## Slide 4: Mathematical Validation
**Civil Engineering Standards**
- **Deterministic Queuing (D/D/1):**
  - Evaluates approach based on uniform arrival rates ($\lambda$) and discharge rates ($\mu$).
  - Calculates the exact proportion of cycle time spent clearing the queue vs. uniform flow.
- **Volume-to-Capacity ($v/c$):**
  - Strict flagging when $v/c > 0.85$, triggering the recommendation engine.
- **Level of Service (LOS):**
  - Delay-based grading from A (free flow, $<10$s delay) to F (oversaturated, $>80$s delay).

## Slide 5: AI Integration
**Azure OpenAI Rationale Engine**
- **How it works:** Once the deterministic engine calculates an optimal green split, the simulation metrics (Before vs. After delays/queues) are sent to an LLM via REST API.
- **The Output:** The LLM responds with a concise, 2-sentence engineering rationale.
- **The Benefit:** Traffic engineers don't just get a number; they receive an explained justification, building trust in the AI's logic.

## Slide 6: Guardrails & Compliance
**Safety First, Always**
- **Disclaimer Banner:** Permanently visible on the dashboard and fixed at the bottom of all printed Field Engineering Reports.
- **Explicit Assumptions:** Documented reliance on deterministic arrival rates and 100% static driver compliance.
- **No Real-Time Control:** FlowGuard AI is strictly an offline analysis tool. It **does not** physically connect to traffic controllers. All recommendations require formal validation by a certified traffic engineer prior to real-world deployment.
