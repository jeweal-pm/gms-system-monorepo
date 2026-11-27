# Design system: merge-split (UI revision 1)

No Merge/Split design exists; the page inherits the Load to Stock tokens and components (C, [load-to-stock design-system](../load-to-stock/design-system.md)): page bg `#F9F9F9`, dark source button `#1C252E` (`Button variant="dark" size="sm"`), primary `Button` `#0E5E63`, remove `#E74C50`, Stock ID badge `#FFD88A`, group row fill `#F9F9F9`, location placeholder `#808D99`.

New visual items (A), built from existing tokens only:

| Item | Style |
|---|---|
| Split group balance chip | `Badge` success "Balanced" / warning "Left …" / danger "Over by …" |
| Totals mismatch banner (S-06) | existing warning `Alert` (orange), above the Totals row |
| Mode chip | Load's mode chip, text "Split · one stock into several" / "Merge · stocks into one" |

No new tokens.
