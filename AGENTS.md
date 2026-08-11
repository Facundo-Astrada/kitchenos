<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agentes y skills — KitchenOS

Los agentes viven en `.claude/agents/` y corren en su propio contexto (no consumen el contexto principal). El roster completo de agentes y skills, organizado por función (Código, Pruebas, Despliegues, Monitoreo, Errores, Documentación, Equipo, Configuración), vive en `CLAUDE.md` → sección "Departamento de Ingeniería" — es la fuente única, no se duplica acá.

Para invocar un agente desde el chat: `Usá el agente [nombre] para esto: [descripción]`
