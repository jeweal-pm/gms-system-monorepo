# SA decisions: currency revision 1

> **Owner amendment 2026-10-27:** one Exchange Rate per currency (the UI saves it to both `selling_rate` and `buying_rate`; no schema change) and the Description is optional. Quotation keeps using the selling rate.

- Feature ID / SA revision / source UI revision: `currency` / 1 / UI rev 1 ([ui-spec](../../../frontend/currency/ui-spec.md))
- Status: **approved and implemented**. Owner 2026-10-26: "uxui ทำ spec Currency ให้เอาไปใช้ใน company profile และทุก currency และ frontend backend ทำต่อเลย". This instruction approved the spec and its implementation in one step, with the defaults in [open-questions.md](../../../frontend/currency/open-questions.md).
- Service: `backend-api-master` (owns schema `partner`). No new service, container, network, volume or package.

| ID | Decision |
|---|---|
| SA-CUR-01 | Table `partner.currency`. Columns: `id` uuid PK; `code` char(3) unique, CHECK `^[A-Z]{3}$`; `name` varchar(100), 1–100 after trim; `description` varchar(250) default ''; `selling_rate` / `buying_rate` numeric(18,4) NULL, CHECK > 0; `active` bool; `created_at`, `updated_at`, `created_by`, `updated_by`. Migration `20261026090000_currency` is expand-only. It seeds one active row per distinct code in `company_profile`, `customer` and `vendor`, plus THB and USD. Common codes get English names; any other code uses the code as its name. Seeded rows have no rates. |
| SA-CUR-02 | The base currency is `company_profile.currency_code`. There is no separate flag. A rate means "1 {code} = rate {base}". On save, the base currency's rates are stored as NULL and ignored. Turning it inactive → `CURRENCY_BASE_LOCKED` (409, fieldErrors `active/base_currency`). It can't be deleted, because Company Profile uses it (`CURRENCY_IN_USE`). |
| SA-CUR-03 | tRPC `currency.list` (VIEW; `{q?, cursor?, limit ≤ 50}`; keyset on code) → `{items, nextCursor, total, baseCode}`. `currency.get({id})` (VIEW) → detail plus `baseCode`. `create` (ADD), `update({id, expectedUpdatedAt, …})` (EDIT; whole replacement; `code` is not accepted) and `delete({id})` (DELETE) all need CSRF. `currency.options` (VIEW on `currency` **or** `quotation`) → `{items: {code, name, active, sellingRate, buyingRate}[] ≤ 500, baseCode}`. Rates are 4-decimal strings or null. |
| SA-CUR-04 | Validation (zod + service): `code` is trimmed, uppercased and must be 3 letters; `name` 1–100; `description` 1–250; each rate is a string `^\d{1,14}(\.\d{1,4})?$` and > 0, or null. A non-base currency needs both rates, else `VALIDATION_ERROR` with `sellingRate`/`buyingRate` `required`. Optimistic `updatedAt`: a mismatch gives `CURRENCY_CHANGED` (409), a missing row `CURRENCY_NOT_FOUND` (404), a duplicate code `CURRENCY_CODE_TAKEN` (409, `code/duplicate`). |
| SA-CUR-05 | Consumers: `vendor.options`, `customer.options` and `companyProfile.options` return `currencies` from this table (`{code, name, active}`, ≤ 500, by code). Countries are unchanged. Saving a vendor, customer or Company Profile accepts a currency that is active in the table or equal to the value already stored on that record. Anything else is `VALIDATION_ERROR` `currencyCode/unknown`, as before. The ICU currency list is no longer used. |
| SA-CUR-06 | Delete is refused with `CURRENCY_IN_USE` (409) while Company Profile, any vendor or any customer stores the code. The check and the delete run in one transaction. |
| SA-CUR-07 | Permission: a new auth catalog leaf `currency` in the Master Code group with all nine actions. The catalog becomes 41 leaves / 358 cells; existing grants are unchanged. `MasterMenu` gains `currency`. A new `requireAnyMasterGrant` serves `currency.options`. |
| SA-CUR-08 | Bounds (4 GB host): list ≤ 50 rows per page, options ≤ 500 rows, no server cache. Logs carry ids and codes only. |

Verification: master UT-CUR-B01…B11 and router GP-MT-CUR; auth catalog test; migration applied in dev; live checks through nginx (see [testing.md](../../../frontend/currency/testing.md)).
