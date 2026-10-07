# Project Architecture Rules

- Keep dashboard report rendering in small tab-specific components mounted by the shared export surface, so printed pages reuse the same calculations as the live dashboard.- Load dashboard tab pages, the export dialog and Excel/PDF libraries lazily (on demand), and never set `optimizeDeps.force` in Vite — keeps first load fast and avoids dev-server re-bundling white screens.
