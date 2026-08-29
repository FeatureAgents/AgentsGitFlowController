# Security Policy

## Supported Versions

We actively support and provide security updates for the latest released version:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

---

## Reporting a Vulnerability or Bypass

If you discover a security issue, vulnerability, or a mechanism bypass (where an agent circumvented protected branch rules unexpectedly):

- Please open an issue directly in our [GitHub Issues](https://github.com/FeatureAgents/AgentsGitFlowController/issues).
- Include the following details to help us investigate and patch:
  1. **Agent Client & Version**: (e.g., Claude Code 2.1, OpenCode 1.18, Antigravity 1.1, Pi 0.84, DSH, Codex)
  2. **Exact Command / Payload**: The shell command or sequence executed by the agent.
  3. **Configuration**: Your `gitflow-guard.config.json` (if customized).
  4. **Observed vs Expected Outcome**: What happened vs what should have been blocked.

Issues will be prioritized and resolved promptly.
