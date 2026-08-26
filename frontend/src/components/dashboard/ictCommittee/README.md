# ICT Committee rendering

These private render modules consume the headless `IctCommitteePresentation` model.
They own markup and interaction state only; presentation ordering, labels, tones,
destinations, matrices, narratives, fallbacks, and RoI display decisions belong to
`buildIctCommitteePresentation`.

`IctCommitteeSection` remains the owner of fetch, refresh, authorization, loading,
stale-data, error, export-capability, and lifecycle behavior.
