# Flat module storage layout

- New company-profile logos are written to `C:\dev\f1-system\storage\files\company-profile\<filename>`.
- New user photos are written to `C:\dev\f1-system\storage\files\user-photo\<filename>`.
- Each module can supply its own safe filename with the matching content extension; UUIDv7 plus the requested extension remains the default.
- Legacy objects remain readable and retained. No files were moved or deleted.
- Validation: storage package 25/25; auth photo tests 29/29; company-profile tests 40/40; both backend typechecks and focused lint passed.
- The running container was not reloaded by this code change. Existing logo metadata still points to its legacy object until a subsequent upload writes a new flat-key object.
