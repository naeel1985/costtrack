// @cashflow/core — the pure financial engines, shared by web and mobile.
//
// The source of truth for all money logic: integer minor units only, no floats,
// no Node builtins, no DB. Only date-fns. Consumers can import the barrel
// (`@cashflow/core`) or a specific engine (`@cashflow/core/projection`).

export * from "./money";
export * from "./domain";
export * from "./banks";
export * from "./initials";
export * from "./card-cycle";
export * from "./salary-period";
export * from "./cashflow-timeline";
export * from "./projection";
export * from "./notifications";
