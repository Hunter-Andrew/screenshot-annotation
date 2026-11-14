# Grilling: Claiming Print Screen from Snipping Tool

Type: grilling
Status: claimed
Blocked by: 03

## Question

On Windows 11, Print Screen goes to Snipping Tool by default, and our `RegisterHotKey` "succeeds" but never fires (proven by the no-admin install test). How should the app get Print Screen?

- **(a)** Offer to turn off `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled`. Find out whether that needs a sign-out.
- **(b)** Use a low-level keyboard hook.
- **(c)** Default to Ctrl+Shift+S and document how to change it.

Deferred by Andrew. Not blocking the stack choice.
