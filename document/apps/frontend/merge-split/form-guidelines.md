# Form guidelines: merge-split (UI revision 1)

- Shared `DocumentForm` behaviour (C): view vs edit mode, dirty confirm on Refresh / Create New / tab close, Save disabled while saving ("Saving…").
- Required marks `*`: Doc Date; per result row Location, Stock Price, Sale Price.
- Split quantities: editing a child recomputes the group balance chip and the totals live; "+ Split" prefills the child with what is left (pcs and weight), or 0 when balanced.
- Merge quantities and cost are locked (computed); details are editable in the row panel.
- Validation runs on Save / Send (S-01…S-06); the first invalid row is focused and named "Row n: …". Inline field errors use the existing field message style.
- Keyboard: dialogs trap focus, Esc closes, focus returns to From Stock; mode radios use arrow keys, Enter = Create.
