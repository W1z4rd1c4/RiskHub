# 158-09 Summary: Fix Tailwind Dynamic Class Purge

## Objective

Fix Tailwind production purge issue in LoginPage caused by dynamic class interpolation for demo account badges.

## Root Cause

Dynamic Tailwind class interpolation like `bg-${account.color}-400/10` cannot be detected by Tailwind's content scanner, causing these classes to be purged from production builds.

## Fix Applied

**File:** `frontend/src/pages/LoginPage.tsx`

Added static `badgeClasses` mapping alongside existing `colorClasses`:

```tsx
const badgeClasses = {
    rose: 'bg-rose-400/10 border-rose-400/20 text-rose-400',
    purple: 'bg-purple-400/10 border-purple-400/20 text-purple-400',
    violet: 'bg-violet-400/10 border-violet-400/20 text-violet-400',
    // ... etc for all colors
};
```

Then used the mapping instead of interpolation:

```diff
- <div className={`... bg-${account.color}-400/10 border-${account.color}-400/20 text-${account.color}-400 ...`}>
+ <div className={`... ${badgeClasses[account.color]}`}>
```

## Verification

Production builds will now retain all badge styling since Tailwind can scan the static class strings.

## Commit

```
fix(158-09): replace dynamic Tailwind classes with static mapping in LoginPage
```
