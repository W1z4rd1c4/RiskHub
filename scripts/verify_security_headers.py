#!/usr/bin/env python3
"""
Security Headers Verification Script

Verifies that the application returns proper security headers.
Used in CI/CD and for local development testing.

Usage:
    python scripts/verify_security_headers.py [--url URL]
"""
import argparse
import sys


# Expected security headers and their values
REQUIRED_HEADERS = {
    "X-Frame-Options": ["DENY"],
    "X-Content-Type-Options": ["nosniff"],
    "Referrer-Policy": ["strict-origin-when-cross-origin"],
}

RECOMMENDED_HEADERS = {
    "Content-Security-Policy": None,  # Just check presence
    "Strict-Transport-Security": None,  # Only in production
    "Permissions-Policy": None,
}


def verify_headers(headers: dict) -> tuple[bool, list[str]]:
    """
    Verify security headers are present and correct.
    
    Returns:
        Tuple of (all_passed, list of issues)
    """
    issues = []
    
    # Check required headers
    for header, expected_values in REQUIRED_HEADERS.items():
        if header not in headers:
            issues.append(f"MISSING: {header}")
        elif expected_values and headers[header] not in expected_values:
            issues.append(
                f"INVALID: {header} = '{headers[header]}' "
                f"(expected: {expected_values})"
            )
    
    # Check recommended headers (warning only)
    for header in RECOMMENDED_HEADERS:
        if header not in headers:
            issues.append(f"WARNING: {header} not set (recommended)")
    
    return len([i for i in issues if not i.startswith("WARNING")]) == 0, issues


def main():
    parser = argparse.ArgumentParser(description="Verify security headers")
    parser.add_argument(
        "--url", 
        default="http://localhost:8000",
        help="Base URL to test (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run with mock headers for CI testing without live server"
    )
    args = parser.parse_args()
    
    if args.mock:
        # Mock headers for CI testing
        print("Running with mock headers (no live server required)")
        headers = {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Content-Security-Policy": "default-src 'self'",
            "Permissions-Policy": "geolocation=()",
        }
    else:
        try:
            import httpx
            response = httpx.get(f"{args.url}/", timeout=10)
            # Keep httpx's case-insensitive Headers object; dict(...) would
            # lowercase keys and break the title-case membership checks below.
            headers = response.headers
        except ImportError:
            print("ERROR: httpx not installed. Run: pip install httpx")
            print("Or use --mock flag for CI testing without live server")
            sys.exit(1)
        except Exception as e:
            print(f"ERROR: Could not connect to {args.url}: {e}")
            print("Use --mock flag for CI testing without live server")
            sys.exit(1)
    
    print(f"\n{'='*60}")
    print("RiskHub Security Headers Verification")
    print(f"{'='*60}\n")
    
    passed, issues = verify_headers(headers)
    
    print("Headers found:")
    for header in list(REQUIRED_HEADERS.keys()) + list(RECOMMENDED_HEADERS.keys()):
        value = headers.get(header, "NOT SET")
        status = "✓" if header in headers else "✗"
        print(f"  {status} {header}: {value[:60]}{'...' if len(str(value)) > 60 else ''}")
    
    print(f"\n{'='*60}")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  • {issue}")
    
    print(f"\nResult: {'PASSED' if passed else 'FAILED'}")
    print(f"{'='*60}\n")
    
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
