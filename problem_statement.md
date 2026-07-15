# ACE Internship Projects – Problem Statements

## Project 1 – Reviewer System Frontend Testing

### Problem Statement
The Reviewer System (`desk.vicharanashala.ai`) is the backbone of ACE. It is where agricultural specialists review, validate, and approve answers before they enter the Golden Database (GDB). The platform manages expert allocation, multi-stage review workflows, reputation scoring, moderator approvals, and notification flows.

Bugs in this interface directly impact:

- Quality of the Golden Database
- Speed of expert review cycles
- Farmer response turnaround times

Currently, issues are identified only through manual observation, creating a risk of unnoticed failures in critical workflows.

### What You Will Build
Set up Playwright in the QA repository and develop end-to-end test coverage for critical moderator and expert workflows, including:

- Moderator login → views question queue → allocates expert → expert receives notification
- Expert login → views assigned question → submits answer → next reviewer receives notification
- Moderator approves final answer → question closes → Q&A enters GDB
- Stuck-question indicators appear when experts do not respond within SLA
- Reputation score updates correctly after review actions
- Queue detail pages show accurate counts
- Analytics dashboards update correctly

### Tech Stack
- Playwright
- TypeScript
- GitHub Actions

### Deliverables
- Minimum 40 Playwright E2E tests
- Automated execution in GitHub Actions
- Bug report documenting issues discovered

### Why This Matters
Every bug in the reviewer interface slows down the validation pipeline. A slower pipeline means slower GDB growth, which ultimately impacts the quality and speed of responses delivered to farmers.

---

# Project 2 – Web App Frontend Testing

## Problem Statement
The ACE Web App is the primary interface used by farmers to submit queries and receive agricultural guidance. The platform currently has no automated test coverage.

Since ACE supports 22 Indic languages and serves users on a wide range of devices, including low-end smartphones, frontend issues can directly affect farmer experience.

### What You Will Build
Set up Playwright and create automated E2E tests covering:

- Farmer submits a query in Hindi and receives a response
- Farmer submits a query in English and receives a response
- 2-hour disclaimer displays correctly when GDB has no match
- Disclaimer appears in the user's language
- Mobile query submission workflows
- Voice input capture and submission
- Error handling:
  - No internet
  - Server failures
  - Empty queries
- Language switching during active sessions

### Tech Stack
- Playwright
- TypeScript
- GitHub Actions

### Deliverables
- Minimum 40 Playwright E2E tests
- Automated CI execution
- Mobile viewport coverage
- Testing bug report

### Why This Matters
For most farmers, the web application is ACE. Any issue in query submission, response rendering, or language handling directly affects their ability to receive timely agricultural guidance.

---

# Project 3 – Answer Evaluation Pipeline

## Problem Statement
Current testing verifies that the pipeline executes successfully but does not validate whether generated answers are actually correct.

ACE now contains more than 20,000 expert-validated Q&A pairs in the Golden Database, providing reliable ground truth data. An automated answer-quality evaluation system is needed to compare generated responses against validated expert answers.

### What You Will Build
Integrate DeepEval into the AjraSakha stable testing suite to evaluate:

- Answer Relevance
- Faithfulness to retrieved GDB content
- GDB Match Score
- Agricultural correctness:
  - Correct crop
  - Correct treatment
  - Correct regional applicability

The system should produce quality scores instead of simple pass/fail outcomes.

### Tech Stack
- Python
- DeepEval
- Anthropic API (Judge Model)
- PostgreSQL

### Deliverables
- Evaluation pipeline integrated into stable testing
- Domain-level quality dashboards
- Baseline quality report covering:
  - Weather
  - Market
  - Soil
  - Schemes
  - GDB Queries
  - Greetings

### Why This Matters
Incorrect agricultural recommendations can cause real-world harm. Traditional testing cannot detect answer quality issues, whereas evaluation metrics can.

---

# Project 4 – Cross-Lingual and Multilingual Testing Suite

## Problem Statement
ACE supports 22 Indic languages and aims to provide equal-quality agricultural guidance regardless of language.

Currently, there is no systematic framework for measuring response quality across different languages.

### What You Will Build
Create a multilingual testing framework that:

- Defines 30 core agricultural scenarios
- Translates them into:
  - Hindi
  - English
  - Kannada
  - Tamil
  - Punjabi
  - Telugu

Execute 180 test cases and evaluate:

- Retrieval correctness
- Language consistency
- Disclaimer localization
- Mid-response language switching
- Proper translation/transliteration of:
  - Crop names
  - Scheme names
  - Pesticide names

Generate a Language Quality Matrix showing performance across domains and languages.

### Tech Stack
- Python
- DeepEval
- WhatsApp Test Client

### Deliverables
- 180 multilingual test cases
- Language Quality Matrix
- Language-specific improvement recommendations

### Why This Matters
A multilingual agricultural platform is only successful if response quality remains consistent across all supported languages.

---

# Project 5 – Farmer Answer Feedback Loop

## Problem Statement
ACE contains over 20,000 expert-validated answers but lacks a structured mechanism for collecting farmer feedback.

An answer may be technically correct while still failing to meet a farmer's needs due to complexity, length, or regional relevance.

### What You Will Build
Develop a feedback collection system integrated with the WhatsApp bot.

Features include:

- Post-answer feedback request:
  - Reply 1 for Yes
  - Reply 2 for No
- Store feedback linked to the retrieved GDB entry
- Dashboard analytics showing helpfulness rates:
  - By GDB entry
  - By domain
  - By language
  - By state
- Automatic re-review triggers for low-performing GDB entries
- Weekly feedback digest for the agricultural team

### Tech Stack
- Python
- WhatsApp API
- MongoDB
- React
- FastAPI

### Deliverables
- End-to-end feedback capture
- Analytics dashboard
- Automated re-review pipeline
- Initial feedback analysis report

### Why This Matters
Farmer feedback provides direct signals about answer usefulness and creates a continuous improvement loop for the Golden Database.

---

# Project 6 – GDB Coverage Gap Detector

## Problem Statement
When ACE cannot answer a question, the system displays a 2-hour disclaimer and routes the query to the reviewer pipeline.

However, there is currently no structured visibility into which unanswered questions occur most frequently.

### What You Will Build
Build a system that continuously analyzes disclaimer-triggered queries and identifies knowledge gaps.

Features include:

- Collect disclaimer-triggered queries
- Cluster questions by:
  - Crop
  - Domain
  - State
  - Intent
- Detect:
  - High-volume gaps
  - Fast-growing gaps
- Generate weekly GDB Gap Reports
- Build coverage heatmaps
- Provide planning inputs for outreach activities

### Tech Stack
- Python
- MongoDB
- scikit-learn or sentence-transformers
- React
- FastAPI

### Deliverables
- Weekly gap analysis pipeline
- Coverage heatmap dashboard
- Prioritized GDB Gap Report
- Outreach planning recommendations

### Why This Matters
Strategic GDB growth is significantly faster than reactive growth. Understanding content gaps allows the team to focus efforts where farmers need help most.

---

# Project 7 – Reviewer System Load and SLA Testing

## Problem Statement
The ACE Reviewer System operates as a highly concurrent workflow involving:

- Automated expert allocation
- Multiple reviewers
- Real-time reputation updates
- Moderator approval workflows

As the platform scales toward 200,000 GDB entries, significantly higher loads will be introduced. The system's behavior under such conditions is currently unknown.

### What You Will Build
Create a load and SLA testing framework for the reviewer backend.

Simulate:

- 50 concurrent expert logins
- 100 simultaneous question submissions
- Concurrent review actions

Measure:

- Expert allocation performance
- Reputation score consistency
- Cosine similarity computation under load
- Moderator workflow reliability

Additional goals:

- Reproduce known production issues
- Validate fixes
- Define and verify SLA targets
- Identify breaking points

### Tech Stack
- Locust
- TypeScript
- MongoDB
- Node.js

### Deliverables
- Complete load testing suite
- SLA compliance report
- Production bug validation report
- Scaling recommendations

### Why This Matters
The reviewer pipeline is critical infrastructure for ACE. Discovering scaling issues during controlled testing is significantly safer than encountering them during national-scale deployment.


# Project 8 – Intelligent Question Assignment & Priority-Based Review Workflow

## Problem Statement

As the number of incoming review requests grows, ensuring that urgent questions receive immediate attention while maintaining balanced expert workloads becomes increasingly difficult.

The current review process lacks intelligent workload management, resulting in:

- Multiple questions of the same priority being assigned to the same expert
- High-priority questions competing with lower-priority reviews
- Lack of visibility into expert workloads and queue health
- Potential loss of work when reviewers must switch focus to urgent tasks

The system requires an intelligent assignment engine that automatically distributes questions, enforces workload constraints, preserves review progress, and prioritizes urgent work.

---

## What You Will Build

Design and implement a **Priority-Aware Question Assignment Engine** that automatically assigns incoming questions to experts while managing workload limits and review priorities.

### Core Features

#### Expert Capacity Management

Each expert can have a maximum of:

- 1 High Priority Question
- 1 Medium Priority Question
- 1 Low Priority Question

Maximum active workload per expert:

```text
Expert A
✓ High Question #101
✓ Medium Question #205
✓ Low Question #310
```

The system must prevent multiple assignments of the same priority level to a single expert.

---

#### Priority Freeze Mechanism

When a High Priority question is assigned:

- All assigned Medium and Low Priority questions automatically enter a Frozen state
- Expert focus shifts exclusively to the High Priority question
- Drafts, comments, and review progress are preserved
- Frozen questions become editable again after High Priority completion

Example:

```text
Before

Medium #201 → In Progress
Low #301 → In Progress

High #101 Assigned

After

High #101 → Active
Medium #201 → Frozen
Low #301 → Frozen
```

After completion:

```text
High #101 → Completed

Medium #201 → Active
Low #301 → Active
```

---

#### Smart Assignment Engine

Assignment workflow:

1. Identify incoming question priority
2. Find experts without an active question of that priority
3. Automatically assign if capacity exists
4. Otherwise place the question into a waiting queue
5. Automatically assign queued questions when capacity becomes available

---

#### Queue Management

Maintain separate queues:

- High Priority Queue
- Medium Priority Queue
- Low Priority Queue

Assignment order:

1. High Priority
2. Medium Priority
3. Low Priority

---

#### Expert Dashboard

Display:

- Assigned High Question
- Assigned Medium Question
- Assigned Low Question
- Question Status
- Active/Frozen State
- Saved Draft Progress

Actions:

- Open Question
- Save Draft
- Submit Review
- Resume Frozen Question

---

#### Admin Dashboard

Display:

- Expert Workloads
- Active Assignments
- Pending Queue
- Frozen Questions
- Completed Questions

Administrative Controls:

- Manual Assignment
- Reassignment
- Assignment Removal
- Queue Monitoring
- Force Unfreeze

---

## Tech Stack

### Frontend

- React.js
- TypeScript
- Material UI / Tailwind CSS

### Backend

- Node.js
- Express.js
- TypeScript

### Database

- MongoDB
- Mongoose

### Real-Time Updates

- Socket.IO

### Queue Processing

- BullMQ
- Redis

### Deployment

- Docker
- MongoDB Atlas

---

## Deliverables

- Intelligent assignment engine
- Priority-aware workload management
- Freeze/Unfreeze workflow
- Expert and Admin dashboards
- Queue processing system
- Real-time workload visibility

---

## Why This Matters

As review volume scales, manual assignment becomes unsustainable. Intelligent workload balancing ensures urgent questions receive immediate attention while preserving expert productivity and review quality.

---

# Project 9 – ExpertFlow: Intelligent Question Review & Expert Assignment Platform

## Problem Statement

Organizations that depend on expert review processes often struggle with manual question allocation, uneven workload distribution, and poor visibility into review operations.

Common challenges include:

- Manual assignment of incoming questions
- Delayed handling of urgent requests
- Uneven expert utilization
- Limited visibility into assignment status
- Difficulty reassigning questions when experts become unavailable

As review volume increases, these challenges reduce operational efficiency and increase response times.

---

## What You Will Build

Build **ExpertFlow**, an intelligent review management platform that automates question assignment, prioritizes urgent requests, balances expert workloads, and provides real-time operational visibility.

---

### Core Features

#### Question Intake & Classification

Each question contains:

| Field | Description |
|---------|-------------|
| Question ID | Unique Identifier |
| Title | Question Summary |
| Description | Detailed Question |
| Category | Domain/Topic |
| Priority | High / Medium / Low |
| Created Time | Submission Timestamp |
| Status | Pending / Assigned / In Review / Completed |
| Assigned Expert | Current Reviewer |

---

#### Intelligent Assignment Engine

Expert States:

- Available
- Busy
- Offline

Assignment Logic:

1. Detect available experts
2. Prioritize highest-priority pending questions
3. Automatically assign work
4. Update expert availability
5. Trigger reassignment when required

Priority Override:

- High Priority queue receives precedence
- Medium and Low queues may be temporarily paused
- Processing resumes after urgent work is handled

---

#### Real-Time Queue Management

Queue Dashboard Metrics:

- Total Pending Questions
- High Priority Count
- Medium Priority Count
- Low Priority Count
- Active Reviews
- Available Experts

Queue States:

- Waiting
- Frozen
- Assigned
- In Review
- Completed

---

#### Expert Workspace

Experts can:

- View assigned questions
- Submit responses
- Complete reviews
- Request reassignment
- View assignment history

Upon completion:

- Expert becomes available
- Assignment engine automatically assigns the next eligible question

---

#### Admin Dashboard

##### Expert Management

View:

- Expert Status
- Active Question
- Completed Reviews
- Average Review Time

##### Assignment Management

Actions:

- Reassign Questions
- Remove Assignments
- Force Prioritize Questions
- Freeze/Resume Queues

##### Monitoring & Analytics

Track:

- Expert Utilization
- Queue Growth
- Resolution Time
- Priority Distribution
- Assignment Success Rate

---

### Advanced Features

#### AI-Powered Classification

Automatically predict:

- Question Category
- Priority Level
- Required Expertise

#### Skill-Based Matching

Assign questions using:

- Domain Expertise
- Historical Performance
- Review Accuracy

#### SLA Monitoring

Track:

- Response Deadlines
- SLA Breaches
- Escalation Alerts

#### Notifications

Support:

- Email
- SMS
- WhatsApp
- In-App Notifications

#### Predictive Analytics

Forecast:

- Question Volume
- Expert Demand
- Wait Times

#### Audit Trail

Maintain complete history of:

- Assignments
- Reassignments
- Status Changes
- Review Actions

---

## Tech Stack

### Frontend

- React.js
- TypeScript
- Redux Toolkit
- Material UI / Tailwind CSS
- Recharts

### Backend

- Node.js
- Express.js
- TypeScript
- Socket.IO

### Database

- MongoDB Atlas
- Mongoose

### Queue & Scheduling

- BullMQ / Redis
- Node-Cron

### Authentication

- JWT
- Role-Based Access Control (RBAC)

### Deployment

- Docker
- Nginx
- AWS / Render / Railway

---

## Deliverables

- Intelligent review management platform
- Automated assignment engine
- Real-time monitoring dashboard
- Expert workspace
- Administrative control panel
- Queue and SLA management system
- Analytics and reporting module

---

## Why This Matters

Efficient expert utilization directly impacts response quality and turnaround time. By automating assignment and providing real-time visibility, organizations can scale review operations while maintaining service quality and operational control.

# Project 10 – LangGraph Workflow Latency Optimization

## Problem Statement

ACE currently uses a LangGraph-based orchestration workflow to process farmer queries through multiple stages, including query understanding, retrieval, reasoning, answer generation, validation, and response delivery.

As the platform scales to support larger user volumes and more complex workflows, latency has become a critical concern. Each node in the workflow contributes to overall response time, and delays accumulate across multiple LLM calls, retrieval operations, database lookups, and external service interactions.

At present, there is limited visibility into which workflow components contribute most significantly to end-to-end latency. Without systematic analysis and optimization, response times may increase as usage grows, negatively impacting farmer experience and operational costs.

### What You Will Build

Analyze the existing LangGraph workflow and identify opportunities to reduce overall response latency.

Areas of investigation include:

- End-to-end workflow profiling
- Node-level latency measurement
- LLM call duration analysis
- Retrieval latency analysis
- Database query performance evaluation
- Parallelization opportunities within LangGraph
- Workflow bottleneck identification
- Caching opportunities
- Prompt optimization opportunities
- Reducing unnecessary graph transitions
- Observability dashboards for latency monitoring

Develop and implement optimizations for the highest-impact bottlenecks.

### Tech Stack

- LangGraph
- Python
- LangSmith
- OpenTelemetry
- PostgreSQL / MongoDB
- Redis
- Grafana

### Deliverables

- Complete latency breakdown of the LangGraph workflow
- Node-level performance report
- Latency observability dashboard
- Implemented optimizations for identified bottlenecks
- Before/after performance comparison report
- Recommendations for future scalability improvements

### Why This Matters

Farmer experience is directly impacted by response speed. Even highly accurate answers lose value if they take too long to arrive. Reducing latency improves user satisfaction, lowers infrastructure costs, and enables ACE to serve larger numbers of farmers efficiently.

---

# Project 11 – Small Language Model Adoption & Cost Optimization

## Problem Statement

ACE currently relies heavily on Large Language Models (LLMs) across multiple workflow stages, including query classification, language detection, intent identification, retrieval routing, answer evaluation, moderation, and response generation.

While LLMs provide strong performance, they introduce higher latency and operational costs. Many workflow tasks may not require the reasoning capabilities of large models and could potentially be handled by smaller, faster, and more cost-efficient models.

The challenge is to systematically identify where Small Language Models (SLMs) can replace LLMs without negatively affecting answer quality, accuracy, or user experience.

### What You Will Build

Conduct a comprehensive analysis of the ACE AI workflow to identify opportunities for SLM adoption.

Areas of investigation include:

- Language detection
- Intent classification
- Query routing
- Query categorization
- Disclaimer detection
- Retrieval relevance scoring
- Metadata extraction
- Conversation summarization
- Expert recommendation
- Moderation checks
- Evaluation pipeline components

For each workflow stage:

- Benchmark current LLM performance
- Evaluate candidate SLMs
- Compare latency
- Compare cost
- Compare accuracy
- Measure quality impact
- Recommend migration strategy

Implement and validate selected SLM replacements in production-like environments.

### Tech Stack

- Python
- LangGraph
- Hugging Face Transformers
- Ollama
- vLLM
- DeepEval
- LangSmith
- PostgreSQL

### Deliverables

- Complete workflow analysis identifying LLM usage
- SLM feasibility report for each workflow stage
- Accuracy, latency, and cost comparison benchmarks
- Prototype implementation of selected SLM replacements
- Production migration recommendations
- Estimated infrastructure cost savings report

### Why This Matters

As ACE scales nationally, model inference costs and response latency will grow significantly. Replacing appropriate LLM workloads with SLMs can reduce costs, improve response times, and increase system scalability while maintaining answer quality for farmers.

