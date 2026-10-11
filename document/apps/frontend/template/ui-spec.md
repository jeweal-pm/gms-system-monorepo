# UI specification: <feature>

- Feature ID / revision: <feature> / <revision>
- Status: draft
- Source: <Figma file/node URL or image path/attachment reference>
- Viewport / source dimensions: <width x height>
- Inspection evidence: <Figma context, screenshot; date>
- Requirements / main flow: <links>
- Review bundle: <links>; central TODO: `document/task/todo/<feature-id>.md`

## Source quality and open decisions

Separate measured Figma values, pixel estimates, code facts, and assumptions. List unavailable
screens/states and questions that change behavior. Do not invent mobile behavior or APIs.

## Page structure and layout

Describe shell/sidebar/header/content/footer, region sizes, alignment, spacing, responsive
rules, scrolling/sticky behavior, and source references. Link tokens in design-system-template.md.

## Component inventory

| ID | Region / component | Existing implementation | Props / states | Source evidence |
|---|---|---|---|---|

Describe colors, typography, borders/dividers, tables, cards, icons, inputs, sheets/dialogs,
and empty/loading/error/success states where relevant. For tables record every column, data
format, sort/filter/page behavior, selection, and actions. For a sheet record side/width,
trigger, close/focus/keyboard behavior, form state, and unsaved-change behavior if required.

## Interaction and data

Map actions, destinations, permissions, and required service capabilities; link the form,
data-fetching, error-handling, and testing documents. Mark unknown rules pending clarification.

## Dependencies and traceability

Link dependencies.md, central tech-stack proposals, SA handoffs, and every corresponding
TODO ID. Reuse current libraries where appropriate; a screenshot cannot identify a library.
