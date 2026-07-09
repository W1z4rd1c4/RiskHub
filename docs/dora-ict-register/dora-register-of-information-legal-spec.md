# EU DORA "Register of Information" (RoI) — Legal & Implementation Reference

Compiled 2026-07-09. All claims below are sourced; primary sources (EUR-Lex, ESA/EBA/EIOPA/ESMA, national competent authorities) are marked **[PRIMARY]**, secondary commentary is marked **[SECONDARY]**. Where automated fetching of the primary legal PDF/XML text failed (binary/rendering issues) and a claim rests only on secondary corroboration, this is flagged explicitly in §7.

---

## 1. Legal basis & status

### 1.1 The parent obligation

**Regulation (EU) 2022/2554** (Digital Operational Resilience Act, "DORA"), **Article 28** ("General principles" for management of ICT third-party risk), governs the register. Key paragraphs, as reconstructed from the consolidated text via secondary aggregators quoting EUR-Lex CELEX 32022R2554 **[SECONDARY, text purports to be verbatim of PRIMARY]**:

- **Art. 28(1):** Financial entities manage ICT third-party risk as an integral part of ICT risk, remain fully responsible for compliance with all obligations regardless of outsourcing, and apply proportionality based on nature/scale/complexity/importance of ICT dependency.
- **Art. 28(2):** Entities must adopt and regularly review a strategy on ICT third-party risk, including a policy on the use of ICT services supporting critical or important functions, at both individual and consolidated levels.
- **Art. 28(3):** The register-of-information obligation itself. Quoted text (opening sentence), corroborated across multiple secondary sources reproducing the CELEX text:
  > "As part of their ICT risk management framework, financial entities shall maintain and update at entity level, and at sub-consolidated and consolidated levels, a register of information in relation to all contractual arrangements on the use of ICT services provided by ICT third-party service providers."

  The paragraph continues (per consistent secondary reproduction) to require that: arrangements be documented distinguishing those supporting **critical or important functions** from those that do not; entities **"report at least yearly to the competent authorities on the number of new arrangements on the use of ICT services, the categories of ICT third-party service providers, the type of contractual arrangements and the ICT services and functions which are being provided"**; the full register be made available to the competent authority **on request**; and entities **notify the competent authority in a timely manner of planned contractual arrangements** concerning critical/important functions, or when a function newly becomes critical/important (source: digital-operational-resilience-act.com reproduction; CSSF guidance corroborates a "≥3 months before implementation, or ≥1 month" national timing gloss — that specific timing gloss is Luxembourg-CSSF practice, **not** a DORA-wide figure, so treat it as jurisdiction-specific, not universal).
- **Art. 28(4)–(8):** Pre-contractual due diligence/risk assessment, information-security requirements, audit rights, contract-termination circumstances, and exit-strategy obligations for critical/important functions.
- **Art. 28(9):** Mandates the ESAs (EBA, EIOPA, ESMA, acting jointly through the Joint Committee) to develop **draft implementing technical standards (ITS)** establishing the **standard templates for the register of information**, including common information across all financial entities' registers, to be submitted to the Commission **by 17 January 2024**.
- **Art. 28(10):** Mandates the ESAs to develop **draft regulatory technical standards (RTS)** further specifying the detailed content of the ICT third-party risk policy referred to in paragraph 2 (this is a *different* RTS from the subcontracting RTS — see 1.3 below), also due **17 January 2024**.

DORA itself: adopted as Regulation (EU) 2022/2554, published OJ 27 December 2022, **applies from 17 January 2025** (Art. 64) **[SECONDARY corroboration of application date is extremely consistent across all sources checked; DORA's own Art. 64 was not independently re-fetched verbatim in this pass — treat the 17 Jan 2025 date as very-high-confidence but not re-verified word-for-word against Art. 64 text itself]**.

### 1.2 The Implementing Technical Standard (the actual RoI templates)

**Commission Implementing Regulation (EU) 2024/2956 of 29 November 2024**, laying down implementing technical standards for the application of Regulation (EU) 2022/2554 with regard to **standard templates for the register of information** — this is the instrument that defines the templates. **[PRIMARY — EUR-Lex]**

- **Adopted:** 29 November 2024
- **Published:** *Official Journal* L series, OJ L, 2024/2956, **2 December 2024**
- **Entry into force:** per its own Art. 7, 20 days after OJ publication → **22 December 2024**
- **Status: in force**, consolidated version dated 02/12/2024, subsequently corrected (see below).
- EUR-Lex: https://eur-lex.europa.eu/eli/reg_impl/2024/2956/oj/eng and https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202402956

**Adoption history / political friction (implementation-relevant):** The ESAs' original draft ITS was submitted 17 January 2024. The European Commission **rejected** aspects of that draft in September 2024 — specifically it wanted financial entities to have a **choice between LEI and the EU Unique Identifier (EUID)** for identifying ICT third-party providers, rather than the ESAs' proposed approach. The ESAs published a formal **Opinion** on the Commission's proposed amendments on **15 October 2024** (with supplementary documents proposing further Annex changes), and the final adopted text incorporated the Commission's amendments on identifier choice. **[SECONDARY — EIOPA/EBA press materials; the EIOPA opinion page itself confirms the existence and date of the opinion, but its full substantive text was not extractable via automated fetch — see §7]**

**Corrigendum:** A corrigendum to CIR 2024/2956 was published, **OJ reference dated 19 September 2025** (2025/90725), correcting specific Annex I field-level errors — not substantive policy changes. Confirmed corrections **[PRIMARY, corrigendum text]**:
- **B_05.01.0020** (ICT third-party provider identification code): simplified the coding structure (removed a "country-code + underscore + type-of-code" concatenation format in favour of listing identifier types directly: LEI, EUID, CRN, VAT, PNR, NIN), while preserving the rule that legal persons must use LEI or EUID.
- **B_05.01.0090**: corrected a cross-reference from "B_05.01.0070" to "B_05.01.0100" (currency reference).
- **B_06.01.0060–B_06.01.0110**: a block renumbering — six consecutive field codes shifted down by 10 (e.g., what was B_06.01.0060 is now effectively B_06.01.0050-equivalent).
- **B_07.01.0110**: an enumerated option's ordinal changed ("Assessment not performed" moved from option "7" to option "3").
- **Implementation note:** any in-app field-code mapping to B_06.01 or B_05.01/B_07.01 must be built against the **corrected** (post-19-Sept-2025) numbering, not the originally-published December 2024 numbering — vendor blogs and Q1 2025 dry-run-era documentation may still show the pre-corrigendum codes.

### 1.3 The related RTS on ICT subcontracting

This is governed by **Article 30** of DORA (not Article 28). Article 30(2)(a) requires contractual arrangements to specify (among other things) the conditions for subcontracting ICT services supporting critical/important functions; **Article 30(5)** mandates the ESAs to develop **draft RTS** specifying the elements a financial entity must determine and assess when subcontracting such services, submitted to the Commission **by 17 July 2024** (Joint Committee final report published 26 July 2024, JC 2024 53). **[SECONDARY, corroborated by ESMA-hosted final-report PDF title/URL and law-firm summaries]**

- Resulting instrument: **Commission Delegated Regulation (EU) 2025/532**, adopted by the Commission in March 2025, **published in the Official Journal 2 July 2025**.
- Because this is an RTS (adopted via the Article 290 TFEU delegated-act procedure), it is a **Delegated Regulation**, not an Implementing Regulation — distinct legal track from the ITS in §1.2, though both stem from DORA Chapter V.
- Scope: proportionality and group application; due-diligence/risk-assessment obligations for subcontracted critical/important functions; conditions under which such services may be subcontracted; required contractual terms. **[SECONDARY — law firm summaries; full RTS text not independently fetched in this pass]**

### 1.4 Instrument map (summary)

| Instrument | Type | Adopted | Published (OJ) | In force | Governs |
|---|---|---|---|---|---|
| Reg. (EU) 2022/2554 (DORA) | Level-1 Regulation | 2022 | 27 Dec 2022 | Applies from 17 Jan 2025 | Art. 28(3) register duty; Art. 28(9)/(10) and Art. 30(5) ITS/RTS mandates |
| Commission Implementing Reg. (EU) 2024/2956 | ITS (implementing act) | 29 Nov 2024 | 2 Dec 2024 | 22 Dec 2024 | RoI templates (Annexes I–IV) |
| Corrigendum to 2024/2956 | Corrigendum | — | 19 Sept 2025 | on publication | Field-code corrections in Annex I |
| Commission Delegated Reg. (EU) 2025/532 | RTS (delegated act) | Mar 2025 | 2 Jul 2025 | per its own entry-into-force article (not independently verified) | ICT subcontracting due-diligence/assessment elements (Art. 30(5)) |

---

## 2. Purpose & mechanics

### 2.1 Who maintains it, and at what levels

Financial entities in DORA's scope (banks, investment firms, payment/e-money institutions, insurers, reinsurers, CCPs, CSDs, trading venues, crypto-asset service providers, ICT third-party providers under the oversight regime, and other in-scope entities per DORA Art. 2) must maintain the register **[PRIMARY basis: DORA Art. 28(3)]** at:
- **entity level** (each individual financial entity),
- **sub-consolidated level**, and
- **consolidated level** (group/parent level, aggregating subsidiary entities' data) — **[PRIMARY, Art. 28(3) text confirmed via multiple secondary reproductions]**.

### 2.2 Purpose (three audiences)

Per CIR 2024/2956's own recitals **[PRIMARY]**: "Information gathered from that register is essential for the financial entities' internal ICT risk management, for the effective supervision of the financial entities by their competent authorities, and for the establishment and conduct of oversight of the critical ICT third-party providers [by the Lead Overseer]." I.e.:
1. **Internal tool** for the financial entity's own ICT third-party risk management.
2. **Supervisory tool** for competent authorities (NCAs) to assess a firm's ICT third-party risk management.
3. **Systemic tool** for the ESAs to designate **Critical ICT Third-Party Providers (CTPPs)** under the DORA Oversight Framework and to map concentration risk EU-wide.

### 2.3 Reporting chain and cadence

- Financial entity → submits its register to its **National Competent Authority (NCA)** by a **national deadline** (NCAs are free to set an earlier date than the EU-wide deadline so they have time to consolidate). Examples reported for the first (2025) cycle **[SECONDARY, multiple law-firm/vendor trackers, not independently cross-checked against each NCA's own primary notice except where noted]**: Austria 31 March 2025; Ireland 4 April 2025; Belgium 10 April 2025; Germany 11 April 2025; France (ACPR) 15 April 2025; Luxembourg (CSSF) 15 April 2025; a number of NCAs (e.g., Italy) aligned to 30 April 2025.
- NCA → submits the consolidated national dataset to the **ESAs** by **30 April** each year (first cycle: 30 April 2025). **[SECONDARY, but very consistently corroborated across EBA's own "preparation for DORA application" page and multiple trackers]**
- Reported **reference date** for the first (2025) submission cycle: **31 March 2025** (i.e., register content "as of" that date). **[SECONDARY — corroborated by a vendor/law-firm cluster; not independently confirmed against a primary EBA reporting-instructions quote in this pass — flag as moderate-confidence]**
- **Frequency:** annual full-register submission is the core cadence established by Art. 28(3) ("at least yearly"); Art. 28(3) separately requires **timely prior notification** to the NCA of planned new arrangements covering critical/important functions (ad hoc, event-driven — not the same as the annual bulk submission).

### 2.4 The 2024 "dry run"

The ESAs ran a **voluntary preparatory "dry run"** in 2024 ahead of the first mandatory (2025) cycle. **[PRIMARY-adjacent: EIOPA/EBA/ESMA publications, though the underlying full PDF report was not text-extractable in this pass]**
- Templates and tooling for the dry run were published 30 May 2024.
- **1,039 financial entities** from all 27 Member States participated, submitting registers by the **30 August 2024** dry-run deadline.
- Data-quality outcome: only **6.5%** of submitted registers passed all data-quality checks cleanly; roughly 50% of the remainder failed fewer than 5 of 116 checks.
- The ESAs shared aggregate/individual data-quality feedback with NCAs (September 2024), who relayed it to individual firms.
- A summary report ("Key findings from the 2024 ESAs' Dry Run exercise," ESA_2024_35) was published, dated in EIOPA/ESMA hosting as December 2024.
- Purpose: de-risk the mandatory 2025 reporting cycle by surfacing data-quality and structural issues in advance.

---

## 3. Template structure — the RoI table family

CIR 2024/2956, **Annex I** ("Instructions for completing the register of information") defines the templates. Cross-checked across three independent fetch/search passes (direct EUR-Lex-derived summary, Springlex's Annex I reproduction, and EBA-sourced search snippets) with **consistent agreement on 15 templates** and their codes/names:

| Code | Name (as consistently reproduced) | What it captures |
|---|---|---|
| **B_01.01** | Entity maintaining the register | Identifies the entity responsible for maintaining/updating this instance of the register (the reporting/consolidating entity). |
| **B_01.02** | List of entities within the scope of consolidation | All group entities included in this register's consolidation perimeter. |
| **B_01.03** | List of branches | Branches of the entity/group located in other jurisdictions. |
| **B_02.01** | Contractual arrangements — general information | One row per contractual arrangement: reference number, type of arrangement, start/end dates, renewal terms, notice period, governing-law country. |
| **B_02.02** | Contractual arrangements — specific information | Per-arrangement detail linking to the ICT service(s) provided, the function(s) supported, and arrangement-specific terms; the main "join" table connecting contracts to services/functions. |
| **B_02.03** | List of intra-group contractual arrangements | Subset of arrangements that are intra-group (entity-to-entity within the same group). |
| **B_03.01** | Entities signing the arrangement, for receiving ICT services | Which group entity/entities are party to the contract as service recipient(s). |
| **B_03.02** | ICT third-party service providers signing the arrangement | Which external provider(s) are party to the contract. |
| **B_03.03** | Entities signing the arrangement, for providing ICT services (intra-group) | Which group entity/entities act as the internal ICT service provider, where relevant. |
| **B_04.01** | Entities making use of the ICT services | The entities that actually *consume* the service under an arrangement (can differ from the contract signatory, e.g. group re-charge/shared-service scenarios). |
| **B_05.01** | ICT third-party service providers | Master data on each provider: identification (LEI/EUID/other), country, financial data (e.g. total assets/turnover context per Annex IV), etc. |
| **B_05.02** | ICT service supply chains | Records the subcontracting chain — which provider relies on which further sub-provider to deliver a given ICT service (uses a "rank" concept per Art. 2 of the ITS: rank 1 = direct provider, rank ≥2 = subcontractor). |
| **B_06.01** | Functions identification | The financial entity's (licensed/business) functions, each with a function identifier, and the flag for whether the function is "critical or important." |
| **B_07.01** | Assessment of ICT services supporting critical or important functions | Criticality/substitutability assessment: degree of substitutability of the provider, impact of disruption/termination, availability of alternatives, exit-plan feasibility, data-sensitivity/impact-of-discontinuation ratings. |
| **B_99.01** | Definitions used by the entity | Free-text glossary where the reporting entity records its own definitions for entity-specific closed-list/free-text values used elsewhere in its register (supports interpretability by the reader/supervisor). |

Annex structure of CIR 2024/2956 itself (distinct from the "B_" template annex):
- **Annex I** — the templates + field-by-field completion instructions (the table above lives here).
- **Annex II** — referenced legal acts, used to standardize "type of licensed activity" per financial-entity type/sector.
- **Annex III** — the **type-of-ICT-services taxonomy** (§4.2 below).
- **Annex IV** — instructions for reporting monetary values (e.g., total assets).

**Confidence note:** the 15-template list and each one-line description above is corroborated by ≥3 independent sources reproducing the same codes and substantially the same descriptions; I was not able to retrieve a clean, directly-quotable verbatim excerpt of Annex I's own header text via automated fetch (PDF/XML renders came back as unparseable binary in every attempt — see §7), so treat the template *codes* as high-confidence (very consistent triangulation) and the *descriptions* as paraphrase-quality, not verbatim-quality.

---

## 4. Key data elements & taxonomies

### 4.1 Identifiers — LEI / EUID and the identifier hierarchy

Per CIR 2024/2956 Art. 3(5)–(6) **[PRIMARY, quoted]**:
- Art. 3(5): "Financial entities shall use a valid and active legal entity identifier (LEI) or the European Unique Identifier (EUID) … to identify all of their ICT third-party service providers that are legal persons, except for individuals acting in a business capacity."
- Art. 3(6): subcontractors supporting critical/important functions must likewise "use a valid and active LEI or provide their EUID, and where available both of these identifiers, except if those subcontractors are individuals acting in a business capacity."
- Recital 9 gloss: EU-established providers may use LEI *or* EUID (or both where available); **third-country providers must use LEI only** (EUID, being an EU business-register construct, isn't available to them).
- Post-corrigendum (19 Sept 2025), field **B_05.01.0020** lists acceptable identifier-type codes directly: **LEI, EUID, CRN, VAT, PNR, NIN** — with LEI/EUID mandatory for legal persons and the others (CRN/VAT/PNR/NIN — commercial register number, VAT number, passport/personal number, national ID number) reserved for individuals acting in a business capacity or as fallbacks.
- This is consistent with the "closed vocabulary of allowed identifier types" pattern that shows up in most RoI implementation guides.

### 4.2 The ICT-service type taxonomy (Annex III)

A **closed, flat (non-hierarchical) list of 19 codes, S01–S19**, corroborated across multiple independent secondary sources (a CMS Law article claimed "18" — flagged below as a probable miscount/outlier against the otherwise-consistent 19-code count from the Springlex Annex III reproduction, an EUR-Lex-derived summary, and independent search-snippet corroboration citing the underlying ESA final report JC 2023 85):

| Code | Type of ICT service |
|---|---|
| S01 | ICT project management |
| S02 | ICT development |
| S03 | ICT help desk and first-level support |
| S04 | ICT security management services (protection, detection, response, recovery; incident handling and forensics) |
| S05 | Provision of data (subscription to data-provider services) |
| S06 | Data analysis |
| S07 | ICT infrastructure, facilities and hosting services (excluding cloud) |
| S08 | Computation (digital processing capability, excluding cloud) |
| S09 | Data storage (excluding cloud) |
| S10 | Telecom carrier |
| S11 | Network infrastructure |
| S12 | Hardware and physical devices (as-a-service) |
| S13 | Software licensing (excluding SaaS) |
| S14 | ICT operation management (including maintenance) |
| S15 | ICT consulting |
| S16 | ICT risk management |
| S17 | Cloud services: Infrastructure-as-a-Service (IaaS) |
| S18 | Cloud services: Platform-as-a-Service (PaaS) |
| S19 | Cloud services: Software-as-a-Service (SaaS) |

Rule: "When referring to a type of ICT services in the templates of the register of information, only the identifier (S01–S19) … shall be reported" — i.e., **only these codes are valid values**; free text is not permitted for this field. **[SECONDARY, but the "closed list, code-only" rule is corroborated by multiple independent sources]**

Context: the **final** ITS taxonomy is reported to have **expanded** the scope of "ICT services" relative to the ESAs' original draft (CMS Law commentary) — explicitly folding in the three cloud service models (S17–S19) and adopting a broad reading that, per that commentary, "essentially reflects the EBA's earlier stance." Exact delta between draft and final was not independently verified against both texts side-by-side in this pass.

### 4.3 Function identifiers & the "critical or important function" flag

- Each function is assigned an identifier following an "F" + sequential-number pattern (F1, F2, …), unique per the combination of (financial entity LEI, licensed activity, function name). **[SECONDARY — moderate confidence; not cross-verified against a second independent source in this pass]**
- The critical/important flag lives in template **B_06.01**, as a closed three-way choice: **"Yes" / "No" / "Assessment not performed."** The exact field code for this flag was originally reported as **B_06.01.0060**, but per the September 2025 corrigendum, the B_06.01.0060–0110 block was **renumbered down by 10** — so implementers should not hard-code "B_06.01.0060" without checking the corrected numbering (see §1.2). Supporting fields include recovery-time/recovery-point objectives (in hours) and a discontinuation-impact rating (Low/Medium/High).
- Downstream, **B_07.01** operationalizes criticality further for the *provider relationship* (not just the function): substitutability, availability of alternative providers, exit-plan feasibility, data-sensitivity, and discontinuation impact — i.e., B_06.01 flags "is this function critical/important," and B_07.01 assesses "how exposed are we, given who supplies it."

### 4.4 Country / currency / dates / reference numbers

- **Country:** ISO 3166-1 alpha-2 codes, used for (at least) provider headquarters location, data-processing/storage location(s), and the governing-law jurisdiction of a contractual arrangement (e.g., field **B_02.01** "country of the governing law," reported at data-model position 0120, `char(2)`). **[SECONDARY]**
- **Currency:** ISO 4217 alphabetic codes for all monetary fields (e.g., contract value, provider financials in B_05.01/Annex IV); expected to align with the entity's financial-statement reporting currency. **[SECONDARY]**
- **Contractual-arrangement dates:** start date, end date (or open-ended flag), renewal terms, and notice period for termination are recorded per arrangement in **B_02.01**. **[SECONDARY]**
- **Reference numbers:** the contractual-arrangement reference number is an entity-assigned alphanumeric code that must remain **unique and consistent over time** and is reused as the linking key across all templates that reference that arrangement (see §5). **[SECONDARY]**

---

## 5. Relational model

The RoI is explicitly designed as a **relational dataset**, not a flat spreadsheet. CIR 2024/2956's own recitals state this directly **[PRIMARY, quoted]**:

- **Recital 4:** "Standard templates should be designed in a technology-neutral manner with open tables, which have a predefined number of columns and an indefinite number of rows … linked to one another by using different specific keys forming a relational structure."
- **Recital 8:** the register "should use four keys" to link data across templates:
  1. **reference number of the contractual arrangement**,
  2. **identifier of financial entities and ICT third-party service providers** (LEI/EUID/etc.),
  3. **function identifier**, and
  4. **type of ICT services** (the S01–S19 code).

### 5.1 How the tables connect (entity ↔ contract ↔ provider ↔ service ↔ function)

Synthesizing the template list (§3) against the four linking keys (§5, recital 8) and EBA-sourced commentary on specific foreign-key relationships:

```
B_01.01 (register-maintaining entity)
   └─ B_01.02 (group entities in scope) ── B_01.03 (branches)
                     │
                     │  [entity LEI/EUID]
                     ▼
   B_03.01 (recipient signatory) ─┐
   B_03.03 (intra-group provider  │   [contract reference number]
            signatory)            ├──► B_02.01 (arrangement: general info —
   B_03.02 (external provider     │        dates, governing law, type)
            signatory)  ──────────┘         │
                                             │  [contract reference number]
                                             ▼
                                     B_02.02 (arrangement: specific info)
                                       │             │
                          [function id]│             │ [ICT service type S01–S19,
                                       ▼             ▼  provider LEI/EUID]
                                B_06.01 (functions,     B_05.01 (ICT third-party
                                 incl. critical/          providers — master data)
                                 important flag)                │
                                       │                        │ [provider rank / chain]
                                       │                        ▼
                                       │                B_05.02 (ICT service supply
                                       │                 chain / subcontracting;
                                       │                 rank 1 = direct, rank ≥2 = sub)
                                       ▼
                                B_07.01 (criticality/substitutability
                                 assessment of the service↔function↔
                                 provider relationship)

   B_02.03 (intra-group subset of B_02.01 arrangements)
   B_04.01 (entities actually consuming the service — may differ
            from the B_03.0x signatories, e.g. shared-service re-charge)
   B_99.01 (entity's own glossary/definitions — annotates closed-list
            or free-text values used anywhere above)
```

In prose: an **entity** (B_01.0x) is party, via one or more **signatories** (B_03.0x), to a **contractual arrangement** (B_02.01/02.02/02.03) identified by a persistent **reference number**. That arrangement is with an **ICT third-party provider** (B_05.01, identified by LEI/EUID/other), who may in turn rely on **subcontractors** forming a **supply chain** (B_05.02, using a numeric "rank" — rank 1 is the direct/prime provider, rank 2+ are subcontractors, per Art. 2 of the ITS). The arrangement supplies one or more **ICT services**, each tagged with a closed **service-type code** (S01–S19), in support of one or more of the entity's **functions** (B_06.01, identified by an F-number and flagged critical/important or not). Where a service supports a critical/important function, **B_07.01** records the criticality/substitutability/exit-risk assessment of that specific service↔function↔provider dependency. **B_04.01** separately tracks which entity actually *consumes* the service (relevant in group/shared-service structures where the contracting entity and the consuming entity differ). **B_99.01** is a cross-cutting annotation table, not a domain entity.

**Confidence note on the diagram:** the four-key linking mechanism and the general "entity→contract→provider→service→function" shape is **[PRIMARY]** (direct from the ITS recitals) and corroborated by EBA-sourced commentary on specific FK relationships (e.g., "B_02.02 references arrangements from B_02.01, providers from B_05.01, and functions from B_06.01"). The precise cardinalities and the exact placement of B_04.01/B_07.01 in the graph are reconstructed from secondary sources and should be validated against the EBA's own published **"Data Model for DORA RoI"** PDF and the **Data Point Model (DPM) dictionary** before being encoded as a database schema — those are the authoritative field-by-field references and were located (URLs in §8) but not successfully text-extracted in this pass (see §7).

---

## 6. Technical reporting format (implementation-relevant)

- Submissions are filed in **xBRL-CSV** format under the **EBA reporting framework / DORA taxonomy** (referred to in sources as "Taxonomy 4.0" and, separately, "taxonomy architecture v2.0" for the RoI package specifically — these two version labels appeared in different sources and were **not reconciled against each other**; treat as needing direct verification against the current EBA taxonomy portal before building an exporter).
- A submission package = a **report-package.json** metadata file + **one CSV file per template** (i.e., one CSV per B_xx.xx table) + references to the published ESA taxonomy, zipped together.
- Financial entities upload to their NCA's portal (e.g., CSSF's "eDesk" in Luxembourg) in this format; NCAs aggregate and forward to the ESAs.
- EBA publishes, alongside the ITS: a **Data Point Model dictionary**, **validation rules** (technical / DPM / business-check layers), and a **data-quality-checks overview** — these are the authoritative implementation artifacts for anyone building a compliant exporter, distinct from (and more granular than) the legal text of the ITS itself.

---

## 7. What could not be fully verified / is version-dependent — explicit flags

1. **ICT service taxonomy count (19 vs. 18):** the great majority of sources converge on **19 codes (S01–S19)**, including three cloud codes (S17 IaaS, S18 PaaS, S19 SaaS). One source (a CMS Law alert, via automated summarization) stated "18 distinct categories." This is flagged as a likely miscount in that single source rather than a genuine alternate figure, but it was **not resolved against a clean, directly-quoted primary-text listing of Annex III** — every attempt to fetch the EUR-Lex PDF/XML or the ESMA/EBA source PDFs for Annex III returned unparseable binary content rather than extractable text. Recommend before building: pull Annex III directly from the EBA's "Data Model for DORA RoI" PDF (URL in §8) with a proper PDF-text extraction tool, not a generic web fetch.
2. **Field-level codes for the "critical or important function" flag and related B_06.01/B_05.01/B_07.01 fields:** confirmed to have been **renumbered by the 19 September 2025 corrigendum**; this document gives the *pre-corrigendum* numbers where sourced material used them, with an explicit note that the block shifted by 10 positions. Do not hard-code field codes without checking the current consolidated Annex I text.
3. **Exact reference date and full national-deadline table for the 2025 first cycle** (31 March 2025 reference date; per-country deadlines Austria/Ireland/Belgium/Germany/France/Luxembourg as listed in §2.3): corroborated by secondary trackers (law firm blogs, vendor sites) but **not cross-checked against each NCA's own primary notice**, except that the EBA's own page confirms the 30 April NCA→ESA deadline. Treat per-country dates as indicative, verify against each NCA's own site if building country-specific deadline logic.
4. **DORA Article 28, paragraphs 4–8 and 30(2)(a)/(5) full verbatim text:** paraphrased from secondary sources, not independently re-quoted word-for-word against EUR-Lex in this pass (the EUR-Lex DORA HTML fetch in this session returned a garbled/mis-paginated extraction — one fetch mislabeled a different paragraph's text as "Article 28(3)," which was caught and discarded in favor of the consistently-corroborated version used above). Recommend re-verifying Art. 28 and Art. 30 full text directly from a clean EUR-Lex HTML/PDF render before treating any *paraphrased* paragraph (as opposed to the directly-quoted paragraph 3 opening sentence) as legally authoritative.
5. **Taxonomy version labels ("Taxonomy 4.0" vs. "taxonomy architecture v2.0"):** both labels appeared in EBA-sourced material for what should be the same or adjacent artifact; not reconciled in this pass.
6. **Substance of the ESAs' 15 October 2024 Opinion** on the Commission's rejection of the draft ITS: existence, date, and topic (LEI/EUID choice) are confirmed; the full substantive arguments were not extractable (PDF/DOCX attachments, not fetched as text).
7. **DORA Art. 64 exact application-date text:** the 17 January 2025 application date is treated as extremely high confidence (near-universal corroboration) but was not re-verified against a direct quote of Art. 64 itself in this session.

Where this document states something as **[PRIMARY]**, it means the underlying fetch tool returned text that was represented as a direct quotation from the EUR-Lex-hosted legal instrument (DORA or CIR 2024/2956) itself — not that I independently re-read the OJ PDF byte-for-byte. Given repeated PDF/XML parsing failures in this session (noted throughout), a second verification pass with a dedicated PDF-text extraction tool against the EUR-Lex PDFs and the EBA "Data Model for DORA RoI" PDF is recommended before this document is treated as a final legal authority for build purposes — it should be treated as **implementation-planning-grade**, cross-triangulated across many independent secondary sources, rather than as a from-scratch primary-source legal reading.

---

## 8. Source list

### Primary / official

- EUR-Lex, Commission Implementing Regulation (EU) 2024/2956 (OJ page): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202402956
- EUR-Lex, CIR 2024/2956 ELI page (consolidated status, corrigendum links): https://eur-lex.europa.eu/eli/reg_impl/2024/2956/oj/eng
- EUR-Lex, corrigendum to CIR 2024/2956 (19 Sept 2025): https://eur-lex.europa.eu/eli/reg_impl/2024/2956/corrigendum/2025-09-19/oj/eng
- EUR-Lex, DORA Regulation (EU) 2022/2554, consolidated HTML: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32022R2554
- EUR-Lex, DORA ELI page: https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng
- European Banking Authority (EBA), "Implementing Technical Standards to establish the templates for the register of information": https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/operational-resilience/implementing-technical-standards-establish-templates-register-information
- EBA, "Preparations for reporting of DORA registers of information" (deadlines, format, DPM/validation-rules links): https://eba.europa.eu/activities/direct-supervision-and-oversight/digital-operational-resilience-act/preparation-dora-application
- EBA, "Data Model for DORA RoI" PDF (field-level data model — located, not text-extracted): https://www.eba.europa.eu/sites/default/files/2025-04/035dd2b6-c7e3-4c7d-954f-6ffd41903de2/Data%20Model%20for%20DORA%20RoI.pdf
- EBA, DORA RoI reporting FAQ, 28 March 2025 version (located, not text-extracted due to PDF parse failure): https://www.eba.europa.eu/sites/default/files/2025-03/31bb6e60-7d10-4405-a8c5-9f04934630ac/20250328%20-%20DORA%20RoI%20reporting%20FAQ%20(updated).pdf
- EBA, DORA reporting validation rules (Excel, located not fetched): https://www.eba.europa.eu/sites/default/files/2024-11/2506bbcd-f8d6-4710-a273-46d812b154f3/Draft%20validation%20rules%20for%20DORA%20reporting%20of%20RoI.xlsx
- EIOPA, "ESAs' Opinion on the European Commission's rejection of the ITS on Registers of Information under DORA": https://www.eiopa.europa.eu/publications/esas-opinion-european-commissions-rejection-its-registers-information-under-dora_en
- EIOPA, "Key findings from the 2024 ESAs' Dry Run exercise (DORA)": https://www.eiopa.europa.eu/publications/key-findings-2024-esas-dry-run-exercise-dora_en
- EIOPA, "ESAs publish templates and tools for voluntary dry run exercise" (30 May 2024): https://www.eiopa.europa.eu/esas-publish-templates-and-tools-voluntary-dry-run-exercise-support-dora-implementation-2024-05-30_en
- ESMA, "Key findings from the 2024 ESAs Dry Run exercise" summary report (ESA_2024_35): https://www.esma.europa.eu/sites/default/files/2024-12/ESA_2024_35_DORA_Dry_Run_exercise_summary_report.pdf
- ESMA, Joint Committee final report JC 2023 85 on draft ITS on Register of Information (precursor to CIR 2024/2956 — note: superseded/amended by the Commission before final adoption, see §1.2): https://www.esma.europa.eu/sites/default/files/2024-01/JC_2023_85_-_Final_report_on_draft_ITS_on_Register_of_Information.pdf
- ESMA, Joint Committee final report on draft RTS on ICT subcontracting (JC 2024 53): https://www.esma.europa.eu/sites/default/files/2024-07/JC_2024_53_Final_report_DORA_RTS_on_subcontracting.pdf
- EBA, "Joint Regulatory Technical Standards on subcontracting ICT services supporting critical or important functions": https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/operational-resilience/joint-regulatory-technical-subcontracting
- CSSF (Luxembourg NCA), "DORA – Submission timeframe for register of information – eDesk Portal open" notices: https://www.cssf.lu/en/2025/04/dora-submission-timeframe-for-register-of-information-edesk-portal-open-as-of-1-april-2025/
- De Nederlandsche Bank (Dutch NCA), "Reporting DORA registers of information": https://www.dnb.nl/en/sector-news/supervision-2025/reporting-dora-registers-of-information/ (fetch attempted, returned HTTP 403 — not verified in this pass)

### Secondary (commentary, law firms, vendors — used for corroboration/triangulation only)

- Springlex, DORA Article 28 text reproduction: https://www.springlex.eu/en/packages/dora/dora-regulation/article-28/
- Springlex, ITS on RoI, Annex I reproduction: https://www.springlex.eu/en/packages/dora/its-roi-regulation/annex-1/
- Springlex, ITS on RoI, Annex III reproduction: https://www.springlex.eu/en/packages/dora/its-roi-regulation/annex-3/
- Springlex, ITS on RoI, Article 3 (general requirements/LEI): https://www.springlex.eu/en/packages/dora/its-roi-regulation/article-3/
- Advisera, "DORA Article 28: General principles" full-text reproduction: https://advisera.com/dora-regulation/general-principles/
- Advisera, "Article 3: General requirements for the templates" [CIR 2024/2956]: https://advisera.com/cir-2024-2956/general-requirements-for-the-templates-of-the-register-of-information/
- digital-operational-resilience-act.com, Article 28 and Article 30 reproductions: https://www.digital-operational-resilience-act.com/Article_28.html , https://www.digital-operational-resilience-act.com/Article_30.html
- CMS Law, "EU's final ITS version extends the scope of ICT services subject to DORA": https://cms.law/en/int/legal-updates/EU-s-final-ITS-version-extends-the-scope-of-ICT-services-subject-to-DORA
- A&O Shearman FinReg, "Implementing Regulation on Standard Templates for the Register of Information": https://finreg.aoshearman.com/Implementing-Regulation-on-Standard-Templates-for
- A&O Shearman FinReg, "EU RTS on subcontracting ICT services supporting critical or important functions under DORA published in OJ": https://finreg.aoshearman.com/EU-RTS-on-subcontracting-ICT-services-supporting-
- Global Regulation Tomorrow (Norton Rose Fulbright), "Published in OJ - DORA Implementing Regulation on standard templates": https://www.regulationtomorrow.com/italy/fintech-italy/published-in-oj-dora-implementing-regulation-on-standard-templates-for-the-register-of-information/
- Global Regulation Tomorrow, "European Commission clarifies DORA definition of ICT services": https://www.regulationtomorrow.com/2025/01/european-commission-clarifies-dora-definition-of-ict-services/
- Lexology, "Final pieces of EU legislation on DORA published": https://www.lexology.com/library/detail.aspx?g=93050610-c9cf-4b14-b46a-86abf66b9654
- Lexology / DORA subcontracting technical standards summary: https://www.lexology.com/library/detail.aspx?g=1d0a1054-0881-4d45-98ce-564c4706d360
- Sidley, Data Matters Privacy Blog, "Financial Entities in the EU: Time to Register Your ICT Third-Party Service Providers under DORA": https://datamatters.sidley.com/2025/04/15/financial-entities-in-the-eu-time-to-register-your-ict-third-party-service-providers-under-dora/
- Sidley, Data Matters Privacy Blog, "DORA – ESAs Publish Draft Technical Standards on ICT Subcontracting": https://datamatters.sidley.com/2024/08/14/dora-esas-publish-draft-technical-standards-on-ict-subcontracting/
- Dorapp.eu, "ESA's DORA reporting deadlines you should watch for in 2025": https://dorapp.eu/blog/esas-dora-reporting-deadlines-you-should-watch-for-in-2025/
- Regulation-dora.eu, "DORA Register of Information: Templates, Format & Deadlines": https://www.regulation-dora.eu/register-of-information (note: this vendor's separate "build methodology" blog post used a non-standard table-naming shorthand — B00/B01/B03/B04/B05/B06/B07/B08/B09/B10 — that **conflicts** with the official B_0x.0x codes confirmed elsewhere; that specific page was treated as unreliable and excluded from §3/§5)
- Copla, "EBA DORA RoI data model explained in plain English": https://copla.com/blog/compliance-regulations/dora-roi-data-model-explained-in-plain-english/
- Copla, "DORA Exit Strategy Requirements: What Supervisors Will Infer": https://copla.com/blog/compliance-regulations/dora-roi-exit-strategy-requirements/
- Fund-XP, "xBRL OIM CSV Preparation for DORA (EBA Taxonomy 4.0)": https://fund-xp.lu/dora/cbie-dora-register-taxonomy/
- DORA Toolkit, "DORA Register of Information: A Practitioner's Guide to All 15 Tables": https://dora-toolkit.eu/blog/dora-register-of-information-guide
- Grace GRC landing page, "EU 2024/2956 - ITS Register of Information": https://gracegrc.net/ITS-register-of-information
- RedIntoGreen, "DORA ICT providers management": https://redintogreen.pl/en/dora-ict-providers-management/

---

## Quick-reference answers to the five investigation prompts

1. **Legal basis & status:** DORA Reg. (EU) 2022/2554 Art. 28(3) creates the duty; Art. 28(9) mandates the ITS; **Commission Implementing Regulation (EU) 2024/2956** (adopted 29 Nov 2024, published 2 Dec 2024, in force 22 Dec 2024, corrected by a corrigendum published 19 Sept 2025) supplies the actual templates. DORA applies from 17 Jan 2025. The related subcontracting RTS is a *separate* instrument under Art. 30(5): **Commission Delegated Regulation (EU) 2025/532** (OJ 2 Jul 2025).
2. **Purpose & mechanics:** maintained by financial entities at entity/sub-consolidated/consolidated levels; reported to NCAs (national deadlines, mostly March–April) who consolidate to the ESAs by 30 April annually; first cycle 2025 (reference date ~31 March 2025); preceded by a voluntary 2024 dry run (1,039 entities, 30 Aug 2024 deadline, only 6.5% fully clean).
3. **Templates:** 15 tables, B_01.01 through B_99.01, as listed in §3 — consistently triangulated across independent sources.
4. **Taxonomies:** LEI/EUID (legal persons) with CRN/VAT/PNR/NIN fallbacks for individuals; ICT-service taxonomy is a closed 19-code list S01–S19 (including S17–S19 for cloud IaaS/PaaS/SaaS) — one discordant secondary source claimed 18, flagged as probable miscount; function IDs follow an F-number pattern; critical/important function is a closed Yes/No/Assessment-not-performed flag on B_06.01.
5. **Relational model:** four linking keys per the ITS recitals — contract reference number, entity/provider identifier, function identifier, ICT-service-type code — connecting entity ↔ contract ↔ provider (↔ subcontract chain) ↔ service ↔ function, as diagrammed in §5.

**Could not verify / flagged:** exact Annex III wording word-for-word (PDF extraction failures — used triangulated secondary corroboration instead); precise current field codes for B_06.01's critical-function flag and neighboring fields post-corrigendum; full verbatim text of DORA Art. 28 paragraphs 4–8 and Art. 30; the substantive content of the ESAs' 15 Oct 2024 Opinion; reconciliation of "Taxonomy 4.0" vs "taxonomy architecture v2.0" labels; and the complete per-country national deadline table for 2025 (indicative only, not verified NCA-by-NCA).
