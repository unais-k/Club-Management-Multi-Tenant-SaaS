# Architecture

```mermaid
flowchart LR
    consumers([Consumers]) --> web["Consumer site<br/>Next.js :3001"]
    admins([Platform admin and club admins]) --> admin["Admin panel<br/>React + Vite :5173"]
    web -->|REST + JWT| api
    admin -->|REST + JWT| api

    subgraph backend["NestJS API :3000"]
        direction TB
        api["Throttler, then JWT guard, then Roles guard<br/>validation pipe, error filter"]
        api --> ctrl["Controllers<br/>auth, tenants, locations, courts,<br/>pricing, memberships, availability, bookings"]
        ctrl --> svc["Services<br/>tenant scoping by clubId"]
        svc --> engine["Pure logic<br/>availability engine, pricing calculator"]
    end

    svc --> db[("PostgreSQL<br/>shared schema, clubId on tenant tables")]
```

## Request flow
1. The client sends `Authorization: Bearer <access token>`.
2. Guards authenticate (user and club loaded from the DB, so deactivation applies immediately) and check the role.
3. A controller passes `clubId` from the token to the service; DTOs are validated first.
4. Services filter every query by `clubId`; bookings run in a transaction with a court row lock, backed by an exclusion constraint.