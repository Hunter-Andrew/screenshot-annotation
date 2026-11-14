# Grilling: Testing strategy

Type: grilling
Status: claimed
Blocked by: 

## Question

How do we test? Cover:
- unit tests for the Annotation model, PNG chunk read/write, and history expiry;
- Rust tests for capture and clipboard;
- end-to-end tests of the editor (Playwright against the web UI);
- what CI runs on every push versus before a release;
- which checks only Andrew can do manually on the work laptop (multi-monitor, Teams/Outlook paste).
