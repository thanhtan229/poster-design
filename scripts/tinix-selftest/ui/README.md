# Editor UI tests

Start TinixPoster before running these tests. The default address is
`http://127.0.0.1:7001`. To test another running instance in PowerShell:

```powershell
$env:TINIX_APP_URL = 'http://127.0.0.1:5173'
```

Fixtures are created in browser memory. These suites do not save or delete designs
in the service. Each case gets its own isolated browser context, page, storage and
editor state. A full run reuses one headless browser process.

## Commands

| Command | Coverage |
| --- | --- |
| `npm run tinix:test-ui:selection` | Marquee, Ctrl/Cmd+A, Escape, text input guards, selection menu actions |
| `npm run tinix:test-ui:menu` | Menu structure, copy/paste/duplicate, groups, visibility and locks, submenu positioning |
| `npm run tinix:test-ui:arrangement` | Layer order, six alignment modes, horizontal/vertical spacing |
| `npm run tinix:test-ui:undo` | Bulk-removal patches, delete-all undo/redo, feedback and quick undo |
| `npm run tinix:test-ui` | All four groups, followed by the existing image-frame suite |

Run multiple groups or one case without running unrelated checks:

```powershell
npm run tinix:test-ui -- selection arrangement
npm run tinix:test-ui -- selection --case=shortcuts
npm run tinix:test-ui -- undo --case=feedback
npm run tinix:test-ui -- undo --case=removals
npm run tinix:test-ui -- image-frame
npm run tinix:test-ui -- --help
```

`undo --case=removals` is a fast Node test and needs no running application.

## Organization

- `editor.cjs`: shared fixtures, state readers, real menu navigation and commands.
- `run.cjs`: suite/case selection, browser lifecycle, time limits, failure artifacts
  and timings.
- `marquee.cjs`, `shortcuts.cjs`, `selection.cjs`: selection cases.
- `menu.cjs`: context menu and layer operations.
- `menu-keyboard.cjs`: arrow navigation, nested submenus, Enter, disabled commands and focus.
- `arrangement.cjs`: ordering, alignment and spacing.
- `undo-delete.cjs`, `undo-feedback.cjs`: deletion history and action notifications.
- `../history-removals.cjs`: undo/redo patch coverage without a browser.

Existing entry points remain available: `ctrl-marquee.cjs`,
`selection-shortcuts.cjs`, `action-feedback.cjs` and `multi-context-menu.cjs`.
They dispatch to the same cases rather than keeping duplicate test bodies.

## Results and failures

The runner prints each case name and elapsed time and stops at the first failure
with a nonzero exit code. Each browser case has a 180-second limit. It always
closes its isolated browser context, including secondary tabs.

`.runtime/ui-tests/results.json` records the latest invocation. Browser failures
also capture `<suite>-<case>.png`, `<suite>-<case>.html` and failed-request details
in `<suite>-<case>.network.json` in that directory.
Artifacts are local and ignored by Git. The report includes the failed assertion
and duration so a failing case can be rerun on its own.

Explicit waits remain for animations, delayed selection frames, history debounce
and notification expiry. Ordinary shared menu commands wait less than the old
blanket 550ms delay. Avoid adding fixed waits when an observable UI condition can
be awaited instead.
