# Query Key Factories

Frontend query keys are centralized here so React Query cache families keep stable, typed array shapes.

Use the domain factory that owns the resource:

```ts
useQuery({
    queryKey: riskHubKeys.capabilities(),
    queryFn: () => riskHubApi.getCapabilities(),
});
```

Keep factory return values shape-compatible with the legacy inline array they replace.
