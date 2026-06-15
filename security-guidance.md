# Catch security issues as Claude writes code

> Install the security-guidance plugin to have Claude review its own code changes for vulnerabilities and fix them in the same session.

The security guidance plugin makes Claude review its own code changes for common vulnerabilities while it works and fix what it finds in the same session. The plugin catches issues such as injection, unsafe deserialization, and unsafe DOM APIs before the code reaches a pull request, reducing how much security review falls to human reviewers downstream.

Once installed, the plugin runs automatically. There is nothing to invoke and no separate command to remember.

The plugin is the in-session companion to Code Review, which runs on pull requests. This plugin reduces what reaches the PR. Code Review catches what does.

## Prerequisites

* Claude Code CLI version 2.1.144 or later
* Python 3.8 or later on your `PATH`. The plugin tries `python3`, `python`, and `py -3` in that order
* A git repository for the directory you work in. The end-of-turn and commit reviews diff against git state and skip silently outside a repository. The per-edit pattern check works anywhere

On first run the plugin creates a virtual environment under `~/.claude/security/` and installs the Claude Agent SDK into it, which requires `pip` and network access. If that install fails, the commit review falls back to a single-shot review instead of the agentic one. On Windows the virtual environment step is skipped, so the agentic commit review runs only if `claude-agent-sdk` is already importable and otherwise falls back the same way.

## Install the plugin

In a Claude Code session, install from the official Anthropic marketplace:

```
/plugin install security-guidance@claude-plugins-official
```

The install prompts for a scope. Choose user scope to write the plugin to your user settings, so it loads in every new local session you start on this machine. If Claude Code reports that the marketplace is not found, run `/plugin marketplace add anthropics/claude-plugins-official` first, then retry the install.

Then activate it in the current session with `/reload-plugins`:

```
/reload-plugins
```

### Enable in cloud sessions and shared repositories

User-scoped plugins do not carry into Claude Code on the web, because those sessions run on Anthropic infrastructure rather than your machine. To enable the plugin there, or to turn it on for everyone who clones a repository, declare it in the project's checked-in settings:

```json
// .claude/settings.json
{
  "enabledPlugins": {
    "security-guidance@claude-plugins-official": true
  }
}
```

Administrators can enable the plugin organization-wide by setting `enabledPlugins` in managed settings.

## What the plugin checks

The plugin reviews Claude's work at three points, each at a different depth:

* **On each file edit**: a fast pattern match for risky calls, with no model call
* **At the end of each turn**: a background model review of everything that turn changed
* **On each commit or push Claude makes**: a deeper agentic review that reads surrounding code

### On each file edit

When Claude writes to a file, the plugin scans the new content for known risky patterns. This is a pattern match with no model call, so it adds no usage cost.

Example pattern categories:

* Dynamic code execution: `eval(`, `new Function`, `os.system`, `child_process.exec`
* Unsafe deserialization: `pickle`
* DOM injection: `dangerouslySetInnerHTML`, `.innerHTML =`, `document.write`
* Workflow files: edits under `.github/workflows/`, which can grant repository-level permissions

The check runs after the edit lands and appends the warning to Claude's context for the next step. Each warning fires once per pattern per file per session, so repeat matches in the same file do not flood the conversation.

### At the end of each turn

A turn is one round of Claude responding: you send a message, Claude works and replies, and the turn ends. After each turn, the plugin computes a git diff of everything that changed in the working tree during the turn, including changes from Claude's edit tools, Bash commands, and subagents, and sends it to a separate Claude review focused on security. The review runs in the background, so Claude's reply is not delayed. If the review finds issues, Claude is re-prompted with the findings and addresses them as a follow-up.

This catches issues a string match cannot, such as:

* Authorization bypass
* Insecure direct object references
* Injection
* Server-side request forgery
* Weak cryptography

The review covers up to 30 changed files per turn and fires at most three times in a row before yielding back to you.

### On each commit or push Claude makes

When Claude runs `git commit` or `git push` through its Bash tool, the plugin runs a deeper agentic review of the change in the background. This review reads surrounding code, including callers, sanitizers, and related files, to decide whether a finding is real before reporting it. The extra context keeps false positives low on patterns that look dangerous in isolation but are safe in your codebase.

This layer fires only on commits and pushes Claude makes through its Bash tool. Commits you run from your own shell, including the `!` shell escape inside a session, are not reviewed. Commit and push reviews are capped at 20 per rolling hour.

### Review independence and limits

The plugin does not ask the same Claude instance that wrote the code to grade itself. The per-edit check is a deterministic string match with no model involved. The end-of-turn and commit reviews run as a separate Claude call with a fresh context and a security-focused prompt.

None of the layers block writes or commits. Findings reach the writing Claude as instructions, Claude addresses them in the conversation, and the review model can miss issues. Treat the plugin as one layer of defense in depth, not a complete security solution.

## Add your own rules

### Add guidance for the model-backed reviews

Create `.claude/claude-security-guidance.md` in your project and describe your threat model and review checklist in plain language. The model-backed reviews load it as additional context alongside the built-in vulnerability checklist.

Example:

```markdown
# Security guidance for this repo

- Do not log `customer_id` or `account_number` at INFO level or above.
- All routes under `/admin` must call `require_role("admin")` before any database read.
- Use `crypto.timingSafeEqual` for token comparison instead of `===`.
```

### Add custom per-edit patterns

Create `.claude/security-patterns.yaml` to add regex or substring rules to the per-edit pattern check:

```yaml
patterns:
  - rule_name: internal_api_key
    substrings: ["sk_live_", "AKIA"]
    reminder: "Hardcoded API key prefix. Load credentials from the secret manager."
  - rule_name: tenant_unfiltered_query
    regex: "\\.objects\\.all\\(\\)"
    paths: ["**/src/tenants/**"]
    reminder: "Multi-tenant code must filter by org_id."
```

| Field           | Type   | Description                                                  |
| :-------------- | :----- | :----------------------------------------------------------- |
| `rule_name`     | string | Identifier shown in the warning                              |
| `reminder`      | string | Warning text appended to Claude's context, capped at 1 KB   |
| `regex`         | string | Python regex matched against the edited content              |
| `substrings`    | list   | Literal substrings; provide this or `regex`                  |
| `paths`         | list   | Optional glob patterns; the rule applies only to matching files |
| `exclude_paths` | list   | Optional glob patterns to skip                               |

The plugin also reads `.claude/security-patterns.yml` and `.claude/security-patterns.json` with the same schema.

### Rule file lookup locations

| Scope         | Path                                        | Notes                                    |
| :------------ | :------------------------------------------ | :--------------------------------------- |
| User          | `~/.claude/claude-security-guidance.md`     | Applies to every project on your machine |
| Project       | `.claude/claude-security-guidance.md`       | Checked in with the repository           |
| Project local | `.claude/claude-security-guidance.local.md` | Gitignored, for personal overrides       |

## Usage cost

The per-edit pattern check makes no model call and adds no cost. The end-of-turn and commit reviews each spend additional model usage.

Both model-backed reviews use Claude Opus 4.7 by default. Set `SECURITY_REVIEW_MODEL` to choose a different model for the end-of-turn review and `SG_AGENTIC_MODEL` for the commit review.

The plugin is available on all plans.

## Disable or uninstall

To turn off individual layers while keeping the rest, set the matching environment variable:

| Variable                        | Effect                                         |
| :------------------------------ | :--------------------------------------------- |
| `ENABLE_PATTERN_RULES=0`        | Disable the per-edit pattern check             |
| `ENABLE_STOP_REVIEW=0`          | Disable the end-of-turn diff review            |
| `ENABLE_COMMIT_REVIEW=0`        | Disable the commit and push review             |
| `ENABLE_CODE_SECURITY_REVIEW=0` | Disable all model-backed reviews at once       |
| `SECURITY_GUIDANCE_DISABLE=1`   | Disable the plugin entirely without uninstalling |

To pause the plugin in your user scope:

```
/plugin disable security-guidance@claude-plugins-official
```

To remove it from your user scope:

```
/plugin uninstall security-guidance@claude-plugins-official
```

## How the plugin integrates with Claude Code

The plugin is built on hooks, the mechanism for running your own code at specific points in Claude's loop. It registers:

| Hook event                                                       | Purpose                                                      |
| :--------------------------------------------------------------- | :----------------------------------------------------------- |
| `SessionStart`                                                   | Bootstrap the plugin's Python environment                    |
| `UserPromptSubmit`                                               | Capture the working-tree baseline for the end-of-turn review |
| `PostToolUse` on `Edit`, `Write`, and `NotebookEdit`             | Per-edit pattern match                                       |
| `Stop`                                                           | End-of-turn diff review, run in the background               |
| `PostToolUse` on `Bash`, filtered to `git commit` and `git push` | Commit and push review, run in the background                |

## How this fits with other security tools

| Stage           | Tool                    | What it covers                                                          |
| :-------------- | :---------------------- | :---------------------------------------------------------------------- |
| In session      | Security guidance plugin | Common vulnerabilities in code Claude writes, fixed in the same session |
| On demand       | `/security-review`      | One-time security pass on the current branch                            |
| On pull request | Code Review             | Multi-agent correctness and security review with full codebase context  |
| In CI           | Static analysis / scanners | Language-specific rules, supply-chain checks, policy enforcement     |

## Troubleshooting

The plugin writes runtime diagnostics to `~/.claude/security/log.txt`. Check there first if reviews are not appearing.

Common reasons a review layer skips without a message in the conversation:

* The directory is not a git repository
* The session has no Anthropic authentication
* A `security-patterns.yaml` file is present but PyYAML is not importable (use `security-patterns.json` instead)

---

Source: https://code.claude.com/docs/en/security-guidance
