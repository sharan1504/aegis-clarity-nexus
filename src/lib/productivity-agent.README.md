# CenOps Productivity Agent

The Productivity Agent is a read-only, provider-agnostic analytics capability. It uses synchronized provider work-item evidence to answer user- and team-productivity questions and generate drill-down reports.

## Supported analysis
- Current week and month work handled
- Past 3, 6 and 12 month trends
- Completed/open workload
- Throughput per week
- Average cycle time when lifecycle timestamps exist
- Work-item drill-down with provider, assignee, status, timestamps and project/account
- CSV export from the Productivity report workspace

## Governance
- Tenant and department scope is enforced before evidence is returned.
- Provider connection state and synchronization freshness are surfaced.
- The agent is read-only; it does not modify tickets, cases, users or production configuration.
- Missing provider fields produce an explicit evidence limitation instead of invented productivity metrics.

## Provider model
The capability is registered against the CenOps provider catalog. A live productivity result requires the provider to be connected and synchronized with user-attribution and work-item lifecycle fields. Provider adapters can progressively map Salesforce cases, ServiceNow tickets, Jira issues, Genesys interactions and other work-item types into the same report contract.

## Copilot examples
- "Show Jira tickets handled by Shyam Srinivasan this month."
- "Compare Shyam Srinivasan's Salesforce performance for the last 3 months."
- "Give me a ServiceNow report for Akash L for this month."
- "Generate a current-week productivity report for Shyam Srinivasan."
