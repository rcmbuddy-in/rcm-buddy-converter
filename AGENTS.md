# Project Architecture Rules

- Keep dashboard report rendering in small tab-specific components mounted by the shared export surface, so printed pages reuse the same calculations as the live dashboard.
- Capture selected report pages after their shared chart-render window, with no repeated per-page delay, to keep multi-page exports responsive.
- Load dashboard tab pages, the export dialog and Excel/PDF libraries lazily (on demand), and never set `optimizeDeps.force` in Vite — keeps first load fast and avoids dev-server re-bundling white screens.
- Initialize the Cloud client only when an optional AI feature is invoked, so missing connection settings cannot block local reports.
