#!/usr/bin/env python3
"""
Verification script for RiskHub Audit Logs.
Ensures log entries are valid JSON, contain required SIEM fields, and don't leak secrets.
"""
import json
import os
import sys
import re
from pathlib import Path

# Required fields for SIEM ingestion
REQUIRED_FIELDS = ["timestamp", "level", "event", "logger", "request_id"]
# Fields that should be present for audited activities
AUDIT_FIELDS = ["user_id", "client_ip"]

# Patterns that might indicate leaked secrets (simplified)
SECRET_PATTERNS = [
    re.compile(r'"password"\s*:\s*"[^"]+"', re.I),
    re.compile(r'"token"\s*:\s*"[^"]+"', re.I),
    re.compile(r'"secret"\s*:\s*"[^"]+"', re.I),
    re.compile(r'"key"\s*:\s*"[^"]+"', re.I),
]

def verify_logs(log_path: str):
    path = Path(log_path)
    if not path.exists():
        print(f"Error: Log file not found at {log_path}")
        return False

    print(f"Verifying {log_path}...")
    errors = 0
    warnings = 0
    line_count = 0

    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            
            line_count += 1
            try:
                data = json.loads(line)
                
                # Check required fields
                missing = [f for f in REQUIRED_FIELDS if f not in data]
                if missing:
                    print(f"Line {i}: ERROR - Missing required fields: {missing}")
                    errors += 1
                
                # Check for secrets
                for pattern in SECRET_PATTERNS:
                    if pattern.search(line):
                        print(f"Line {i}: WARNING - Potential secret detected in log line")
                        warnings += 1

            except json.JSONDecodeError:
                print(f"Line {i}: ERROR - Invalid JSON")
                errors += 1

    print("-" * 30)
    print(f"Verified {line_count} lines.")
    print(f"Errors: {errors}")
    print(f"Warnings: {warnings}")
    
    return errors == 0

if __name__ == "__main__":
    # Default to local logs directory
    default_log = Path(__file__).parent.parent / "logs" / "audit.json.log"
    log_file = sys.argv[1] if len(sys.argv) > 1 else str(default_log)
    
    success = verify_logs(log_file)
    sys.exit(0 if success else 1)
