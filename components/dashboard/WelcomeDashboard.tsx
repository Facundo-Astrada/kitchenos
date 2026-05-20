'use client'

import Link from 'next/link'

interface WelcomeDashboardProps {
  nombre: string
}

const GUIDED_STEPS = [
  {
    step: 1,
    icon: 'menu_book',
    label: 'Importá tus recetas con IA',
    desc: 'Sacá una foto o pegá texto — la IA arma la ficha técnica',
    href: '/recetario',
  },
  {
    step: 2,
    icon: 'restaurant_menu',
    label: 'Armá tu carta',
    desc: 'Agregá platos y vinculá las recetas importadas',
    href: '/carta',
  },
  {
    step: 3,
    icon: 'inventory_2',
    label: 'Cargá tu stock inicial',
    desc: 'Registrá los insumos que tenés en tu cocina',
    href: '/stock',
  },
  {
    step: 4,
    icon: 'groups',
    label: 'Sumá a tu equipo',
    desc: 'Invitá cocineros y asigná roles y plazas',
    href: '/turnos',
  },
  {
    step: 5,
    icon: 'playlist_add_check',
    label: 'Configurá tu checklist',
    desc: 'Definí la mise en place de cada plaza',
    href: '/checklist',
  },
]

export default function WelcomeDashboard({ nombre }: WelcomeDashboardProps) {
  return (
    <div className="flex flex-col gap-5" style={{ padding: '24px 16px' }}>
      {/* Greeting */}
      <div>
        <h1
          className="text-[22px] font-bold leading-tight"
          style={{ color: 'var(--text-1)' }}
        >
          ¡Bienvenido, {nombre}!
        </h1>
        <p
          className="text-[14px] mt-2 leading-relaxed"
          style={{ color: 'var(--text-2)' }}
        >
          KitchenOS organiza tu cocina con fichas técnicas, control de stock,
          checklists y más. La IA te ayuda a importar recetas en segundos.
        </p>
      </div>

      {/* IA highlight card */}
      <div
        className="flex items-center gap-3 rounded-[14px] p-[14px_16px]"
        style={{
          background: 'linear-gradient(135deg, var(--navy), #4361a0)',
        }}
      >
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,.15)' }}
        >
          <span className="material-symbols-outlined text-[22px] text-white">
            auto_awesome
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white">
            IA integrada
          </div>
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,.7)' }}>
            Importá recetas con foto, texto o dictado. La IA extrae ingredientes, pesos y costos.
          </div>
        </div>
      </div>

      {/* Guided steps */}
      <div>
        <div
          className="text-[11px] font-bold uppercase tracking-[.08em] mb-3"
          style={{ color: 'var(--text-2)' }}
        >
          Primeros pasos
        </div>

        <div className="flex flex-col gap-[10px]">
          {GUIDED_STEPS.map(({ step, icon, label, desc, href }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-[14px] p-[14px_16px] transition-transform active:scale-[.98]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="w-[36px] h-[36px] rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold"
                style={{
                  background: 'rgba(67,97,160,.1)',
                  color: 'var(--navy)',
                }}
              >
                {step}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>
                  {label}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {desc}
                </div>
              </div>
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ color: 'var(--text-3)' }}
              >
                {icon}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
