# Testability Guide

This document describes how AI verifies each feature through shell-based execution.

## Verification Methods

### Quick Reference
| Feature | Verification Command | Type |
| :--- | :--- | :--- |
| [Feature Name] | `[shell command]` | Standard |
| [Feature Name] | See [Long-Running: Feature Name] | Long-Running |
| [Feature Name] | See [User-in-the-Loop: Feature Name] | User Action Required |

## Standard Verifications

### [Feature Name]
```bash
# Command to verify feature
[command with arguments]
```
**Expected Output**: [Description of successful output]

## Long-Running Process Verifications

For features involving services, servers, or processes that don't terminate immediately.

### [Feature Name]
**Start**:
```bash
# Start the process with timeout/background
timeout 30 ./start-service &
```

**Verify**:
```bash
# Health check or verification command
curl -f http://localhost:8080/health
```

**Stop**:
```bash
# Cleanup
kill %1
# or
pkill -f "service-name"
```

**Notes**: [Any special considerations]

## User-in-the-Loop Verifications

For features requiring human interaction (OAuth, visual verification, hardware, etc.).

### [Feature Name]
**AI Setup**:
```bash
# Commands AI runs to prepare the test
[setup commands]
```

**User Action Required**:
> [Clear description of what the user must do]
> Example: "Open browser to http://localhost:3000, click 'Login', complete OAuth flow"

**AI Verification** (after user confirms completion):
```bash
# Commands AI runs to verify the result
[verification commands]
```

**Expected Result**: [What indicates success]

## Environment Setup

### Prerequisites
- [Dependency 1]
- [Dependency 2]

### Before Testing
```bash
# Any setup commands needed before running verifications
[setup commands]
```

### Cleanup
```bash
# Commands to reset state between tests
[cleanup commands]
```

