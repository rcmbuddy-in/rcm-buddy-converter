# Project Architecture Rules

- Keep dashboard report rendering in small tab-specific components mounted by the shared export surface, so printed pages reuse the same calculations as the live dashboard.