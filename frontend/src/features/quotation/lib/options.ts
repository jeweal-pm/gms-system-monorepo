/** Fixed choices that have no master yet (SA quotation rev 1, Q-QT-05; charge types SA-QT-08). */

export type Option = { value: string; label: string };

export const toOptions = (values: readonly string[]): Option[] => values.map((value) => ({ value, label: value }));

/** Certificate types: free text in the contract; offered as a short list until a master exists. */
export const CER_TYPES: Option[] = toOptions(["GIA", "GRS", "AIGS", "GIT", "SSEF"]);

/** Same keys as the server's `ChargeType`. */
export const SERVICE_CHARGE_TYPES: Option[] = [
  { value: "SHIPPING", label: "Shipping" },
  { value: "HANDLING", label: "Handling fee" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "CERTIFICATE", label: "Certificate fee" },
];
