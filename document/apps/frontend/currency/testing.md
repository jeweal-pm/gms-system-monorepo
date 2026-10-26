# Testing: currency

| ID | Level | What |
|---|---|---|
| UT-CUR-01 | frontend unit | form schema: code 3 letters (uppercased), name/description bounds, rate format (> 0, ≤ 4 decimals), rates required only for a non-base currency |
| UT-CUR-02 | frontend unit | `toFormValues` / `toInput` / `toDuplicateValues` (code cleared, base rates dropped) |
| UT-CUR-03 | frontend unit | drawer `rowText` (base / rates / not set), `formatRate` |
| UT-CUR-04 | frontend unit | `mapSaveError` / `mapDeleteError` domain codes |
| UT-CUR-05 | frontend unit | shared `toSelectOptions` marks inactive currencies; `currencyChoices` keeps the saved inactive one only |
| UT-CUR-06 | frontend unit | Quotation exchange rate from Selling Rate; base → empty |
| UT-NAV-F02/F03 | frontend unit | Master Code tile and context panel use `/setup/currency` + `currency` permission |
| UT-CUR-B01…B10 | master unit | list/get/create/update/delete, code taken, stale, base rules (no rates stored, can't deactivate), rates required, in use, options |
| UT-CUR-B11 | master unit | Vendor/Customer/Company Profile options and membership read the currency table (active, or the stored code) |
| GP-MT-CUR | master router | `currency.*` permissions; options allowed with `quotation:VIEW` |
| UT-CAT | auth unit | catalog 41 leaves / 358 cells, `currency` under Master Code |
| TC-CUR-01…05 | browser (nginx :8080) | create USD with rates, drawer row text, edit, base currency read-only rates, Company Profile / Vendor select lists the master currencies |
