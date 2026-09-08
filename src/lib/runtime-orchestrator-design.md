# Runtime Orchestrator

The orchestrator coordinates trusted stages: evidence collection through the Capability Router, deterministic policy evaluation, approval, execution, and verification.

It never grants permission, invents provider capabilities, or delegates authorization to an LLM. The current security adapter intentionally stops at approval because GitHub currently exposes read evidence for this path; execution requires an explicit trusted write capability.
