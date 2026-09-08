# Runtime Orchestrator

The runtime orchestrator coordinates trusted stages in this order:

1. Collect evidence through the Capability Router.
2. Evaluate evidence with deterministic policy code.
3. Persist the policy result and request explicit approval when required.
4. Only after approval may a trusted execution adapter provide an execution result.
5. Verify the provider result and persist verification evidence.

The orchestrator does not grant permissions, invent capabilities, or ask an LLM to decide whether a production action is allowed.
