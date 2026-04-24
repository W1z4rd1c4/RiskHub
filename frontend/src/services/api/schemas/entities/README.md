# Entity Runtime Schemas

Domain-split Zod/runtime schemas for API entities.

This directory keeps large schema contracts manageable while preserving stable public exports through the schema index. Add new schemas near their domain and keep them passthrough-compatible when backend fields are additive during a rollout.

Workflow metadata such as questionnaire, KRI history, and dashboard capabilities should be modeled here before UI components consume it.
