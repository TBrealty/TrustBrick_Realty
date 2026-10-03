# 3. ERD

One giant diagram would be unreadable, so the model is drawn as a core ERD plus one per domain. Only key and
identifying columns are shown; the full column lists live in [04-tables.md](04-tables.md).

GitHub renders these Mermaid diagrams directly in the browser.

## 3.1 Core model

The six stable nouns and the spine that connects them.

```mermaid
erDiagram
  USERS ||--o{ MEMBERSHIPS : "belongs via"
  ORGANIZATIONS ||--o{ MEMBERSHIPS : "has"
  MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : "granted"
  ROLES ||--o{ MEMBERSHIP_ROLES : "assigned"
  ROLES ||--o{ ROLE_PERMISSIONS : "grants"
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : "in"

  PLACES ||--o{ PLACES : "parent of"
  PLACES ||--o{ ADDRESSES : "locates"
  ADDRESSES ||--|| PROPERTIES : "sited at"

  ORGANIZATIONS ||--o{ PROPERTIES : "manages"
  PROPERTIES ||--o{ LISTINGS : "offered as"
  ORGANIZATIONS ||--o{ LISTINGS : "publishes"
  LISTINGS ||--o{ LISTING_PRICES : "priced over time"
  LISTINGS ||--o{ OFFERS : "receives"
  OFFERS ||--o| TRANSACTIONS : "becomes"
  PROPERTIES ||--o{ TRANSACTIONS : "subject of"

  USERS {
    uuid id PK
    citext email UK
    text public_id UK
    text platform_role
    timestamptz deleted_at
  }
  ORGANIZATIONS {
    uuid id PK
    text slug UK
    text org_type "brokerage|developer|pm|personal"
    boolean is_personal
    timestamptz deleted_at
  }
  MEMBERSHIPS {
    uuid id PK
    uuid user_id FK
    uuid organization_id FK
    text status
  }
  PLACES {
    uuid id PK
    uuid parent_id FK
    text place_type "country|state|city|locality|sub_locality"
    ltree path
    geography centroid
    geometry boundary
  }
  ADDRESSES {
    uuid id PK
    uuid place_id FK
    text postal_code
    geography location "Point 4326"
  }
  PROPERTIES {
    uuid id PK
    text public_id UK
    uuid address_id FK "unique"
    uuid organization_id FK "nullable"
    uuid project_id FK "nullable"
    uuid building_id FK "nullable"
    uuid property_type_id FK
    smallint floor_number
    text unit_number
    numeric carpet_area_sqft
    text source
    timestamptz deleted_at
  }
  LISTINGS {
    uuid id PK
    text public_id UK
    uuid property_id FK
    uuid organization_id FK
    text transaction_type "sale|rent|lease"
    text status
    numeric price
    timestamptz published_at
    timestamptz expires_at
  }
  LISTING_PRICES {
    uuid id PK
    uuid listing_id FK
    numeric price
    tstzrange effective
  }
```

## 3.2 Geography, projects and property detail

Note the merged unit model (decision D2) and the absent `floors` table (D3).

```mermaid
erDiagram
  PLACES ||--o{ PROJECTS : "located in"
  ORGANIZATIONS ||--o{ PROJECTS : "developed by"
  PROJECTS ||--o{ BUILDINGS : "contains"
  PROJECTS ||--o{ UNIT_TYPES : "offers"
  BUILDINGS ||--o{ PROPERTIES : "contains"
  UNIT_TYPES ||--o{ PROPERTIES : "templates"
  PROPERTY_TYPES ||--o{ PROPERTIES : "classifies"

  PROPERTIES ||--o| RESIDENTIAL_ATTRIBUTES : "when residential"
  PROPERTIES ||--o| COMMERCIAL_ATTRIBUTES : "when commercial"
  PROPERTIES ||--o| LAND_ATTRIBUTES : "when land"
  PROPERTIES ||--o{ PROPERTY_MERGES : "deduplicated by"
  PROPERTIES ||--o{ MEDIA_LINKS : "illustrated by"
  MEDIA ||--o{ MEDIA_LINKS : "attached via"

  PROJECTS {
    uuid id PK
    uuid organization_id FK
    uuid address_id FK
    text rera_number
    text status "planned|under_construction|ready"
  }
  BUILDINGS {
    uuid id PK
    uuid project_id FK
    text name
    smallint floors_above_ground
  }
  UNIT_TYPES {
    uuid id PK
    uuid project_id FK
    text name "3BHK Type A"
    numeric carpet_area_sqft
    smallint bedrooms
  }
  PROPERTY_TYPES {
    uuid id PK
    text code UK "apartment|villa|plot|office"
    text category "residential|commercial|land"
  }
  RESIDENTIAL_ATTRIBUTES {
    uuid property_id PK "also FK to properties"
    smallint bedrooms
    smallint bathrooms
    text furnishing
    text facing
  }
  COMMERCIAL_ATTRIBUTES {
    uuid property_id PK "also FK to properties"
    numeric floor_plate_sqft
    smallint workstations
    text grade
  }
  LAND_ATTRIBUTES {
    uuid property_id PK "also FK to properties"
    numeric plot_area_sqyd
    text zoning
    text road_width_ft
  }
  MEDIA {
    uuid id PK
    text storage_key UK
    text media_type
    text checksum
  }
  MEDIA_LINKS {
    uuid id PK
    uuid media_id FK
    uuid property_id FK "one of these"
    uuid project_id FK
    uuid listing_id FK
    smallint sort_order
  }
```

## 3.2a PGs (paying-guest accommodation)

The physical space and the market offer are separate, exactly as for any other property (decision D10). Gender
policy sits on the listing's terms, never on a user.

```mermaid
erDiagram
  PROPERTY_TYPES ||--o{ PROPERTIES : "classifies (code: pg)"
  PROPERTIES ||--o| PG_ATTRIBUTES : "when a PG"
  PROPERTIES ||--o{ LISTINGS : "offered as"
  LISTINGS ||--o| PG_LISTING_TERMS : "when transaction_type = pg"
  LISTINGS ||--o{ PG_ROOM_OFFERS : "offers rooms"
  PROPERTIES ||--o{ PG_BEDS : "phase 5: occupancy"

  PG_ATTRIBUTES {
    uuid property_id PK "also FK to properties"
    smallint total_rooms
    smallint total_beds
    smallint attached_bathrooms
    boolean common_kitchen
  }
  PG_LISTING_TERMS {
    uuid listing_id PK "also FK to listings"
    text gender_policy "men|women|any"
    text meals "none|breakfast|two|three"
    text food_preference "veg|non_veg|both"
    smallint notice_period_days
    smallint lock_in_months
    time entry_curfew "nullable"
  }
  PG_ROOM_OFFERS {
    uuid id PK
    uuid listing_id FK
    text occupancy "single|double|triple|quad"
    numeric rent_per_bed
    numeric deposit_amount
    smallint beds_available
    boolean has_ac
    boolean attached_bathroom
  }
  PG_BEDS {
    uuid id PK
    uuid property_id FK
    text room_label
    text bed_label
  }
```

## 3.3 CRM, consumer and visits

A contact exists whether or not the person ever registers; `contacts.user_id` links them if they do.

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ CONTACTS : "owns"
  USERS ||--o| CONTACTS : "may be"
  CONTACTS ||--o{ LEADS : "generates"
  ORGANIZATIONS ||--o{ LEADS : "owns"
  LISTINGS ||--o{ LEADS : "sourced from"
  MEMBERSHIPS ||--o{ LEADS : "assigned to"
  LEADS ||--o{ LEAD_ACTIVITIES : "logs"
  LEADS ||--o{ TASKS : "schedules"
  PIPELINE_STAGES ||--o{ LEADS : "positions"
  LEADS ||--o{ VISITS : "arranges"
  PROPERTIES ||--o{ VISITS : "visited"
  VISITS ||--o{ VISIT_PARTICIPANTS : "attended by"

  USERS ||--o{ SAVED_PROPERTIES : "saves"
  USERS ||--o{ SAVED_SEARCHES : "saves"
  USERS ||--o{ PROPERTY_VIEWS : "views"
  PROPERTIES ||--o{ SAVED_PROPERTIES : "saved as"
  PROPERTIES ||--o{ PROPERTY_VIEWS : "viewed as"

  CONTACTS {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK "nullable"
    citext email
    text phone
  }
  LEADS {
    uuid id PK
    uuid organization_id FK
    uuid contact_id FK
    uuid listing_id FK "nullable"
    uuid assigned_membership_id FK
    text intent "buy|rent|sell|invest"
    text status
    numeric budget_min
    numeric budget_max
  }
  LEAD_ACTIVITIES {
    uuid id PK
    uuid lead_id FK
    text activity_type "call|email|whatsapp|note|status_change"
    timestamptz occurred_at
  }
  VISITS {
    uuid id PK
    uuid property_id FK
    uuid listing_id FK "nullable"
    timestamptz scheduled_at
    text status "scheduled|confirmed|completed|cancelled|no_show"
  }
  SAVED_SEARCHES {
    uuid id PK
    uuid user_id FK
    jsonb criteria
    text alert_frequency
  }
```

## 3.4 Trust and intelligence

Everything here is derived and versioned. Nothing here is a column on `properties`.

```mermaid
erDiagram
  PROPERTIES ||--o{ VERIFICATION_CASES : "verified by"
  ORGANIZATIONS ||--o{ VERIFICATION_CASES : "verified by"
  USERS ||--o{ VERIFICATION_CASES : "verified by"
  VERIFICATION_CASES ||--o{ VERIFICATION_CHECKS : "comprises"
  VERIFICATION_CASES ||--o{ VERIFICATION_DOCUMENTS : "evidenced by"

  PROPERTIES ||--o{ TRUST_SCORES : "scored"
  TRUST_SCORES ||--o{ TRUST_SCORE_FACTORS : "explained by"
  PROPERTIES ||--o{ VALUATIONS : "valued"
  VALUATIONS ||--o{ VALUATION_COMPARABLES : "supported by"
  PROPERTIES ||--o{ VALUATION_COMPARABLES : "compared as"

  VERIFICATION_CASES {
    uuid id PK
    text subject_type "property|organization|user|project"
    uuid subject_id
    text category "identity|rera|address|document|site_visit"
    text status
    text result
    timestamptz performed_at
  }
  VERIFICATION_CHECKS {
    uuid id PK
    uuid case_id FK
    text check_type
    text result "pass|fail|inconclusive"
    jsonb provider_payload
  }
  VERIFICATION_DOCUMENTS {
    uuid id PK
    uuid case_id FK
    uuid media_id FK
    timestamptz retention_until
    uuid consent_id
  }
  TRUST_SCORES {
    uuid id PK
    text entity_type
    uuid entity_id
    smallint score
    text algorithm_version
    timestamptz calculated_at
  }
  TRUST_SCORE_FACTORS {
    uuid id PK
    uuid trust_score_id FK
    text factor_code
    numeric contribution
    text explanation
  }
  VALUATIONS {
    uuid id PK
    uuid property_id FK
    text method "automated|professional_appraisal"
    numeric estimate
    numeric low_estimate
    numeric high_estimate
    text confidence
    text model_version
  }
```

## 3.5 Messaging, deals and property management

Drawn together because they share the transaction spine. All of this is phase 4+; it is shown to prove the core
model can carry it without change.

```mermaid
erDiagram
  CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : "includes"
  CONVERSATIONS ||--o{ MESSAGES : "carries"
  USERS ||--o{ CONVERSATION_PARTICIPANTS : "participates"

  PROPERTIES ||--o{ TRANSACTIONS : "sold or let"
  LISTINGS ||--o| TRANSACTIONS : "originates"
  TRANSACTIONS ||--o{ TRANSACTION_PARTIES : "between"
  TRANSACTIONS ||--o{ TRANSACTION_DOCUMENTS : "papered by"
  TRANSACTIONS ||--o{ PAYMENTS : "settled by"
  TRANSACTION_DOCUMENTS ||--o{ SIGNATURE_REQUESTS : "signed via"
  OFFERS ||--o{ TRANSACTION_PARTIES : "made by"

  PROPERTIES ||--o{ LEASES : "let under"
  LEASES ||--o{ LEASE_PARTIES : "between"
  LEASES ||--o{ RENT_CHARGES : "bills"
  RENT_CHARGES ||--o{ RENT_PAYMENTS : "settled by"
  PROPERTIES ||--o{ MAINTENANCE_REQUESTS : "needs"
  MAINTENANCE_REQUESTS ||--o{ VENDOR_ASSIGNMENTS : "dispatched to"
  VENDORS ||--o{ VENDOR_ASSIGNMENTS : "performs"

  TRANSACTIONS {
    uuid id PK
    uuid property_id FK
    uuid listing_id FK "nullable, off-market allowed"
    text transaction_type
    text status
    numeric agreed_price
    timestamptz closed_at
  }
  TRANSACTION_PARTIES {
    uuid id PK
    uuid transaction_id FK
    uuid user_id FK "nullable"
    uuid organization_id FK "nullable"
    text party_role "buyer|seller|agent|lender"
  }
  PAYMENTS {
    uuid id PK
    uuid transaction_id FK "nullable"
    uuid rent_charge_id FK "nullable"
    numeric amount
    char currency
    text provider_reference
    text status
  }
  LEASES {
    uuid id PK
    uuid property_id FK
    daterange term
    numeric rent_amount
    numeric deposit_amount
  }
```
