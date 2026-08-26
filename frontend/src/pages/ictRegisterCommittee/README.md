# frontend/src/pages/ictRegisterCommittee

`buildIctCommitteePresentation.ts` is the ICT Committee's single headless
presentation interface. It converts the server snapshot plus active locale into a
complete presentation model for the private dashboard render modules. Network,
authorization, browser-history, and lifecycle behavior stay outside this module.
