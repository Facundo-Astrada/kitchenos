'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Rol } from '@/types'

// ── Avatar color palette ──────────────────────────────────────
const AVATAR_COLORS = [
  '#4361a0', '#2c5282', '#2563eb', '#0891b2',
  '#059669', '#d97706', '#dc2626', '#db2777',
]

function pickColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.trim()?.[0] ?? ''
  const a = apellido?.trim()?.[0] ?? ''
  return (n + a).toUpperCase() || '??'
}

// ── Map DB roles to app Rol type ──────────────────────────────
function mapRol(dbRol: string, plaza?: string | null): Rol {
  switch (dbRol) {
    case 'admin':
      return 'admin'
    case 'sous_chef':
      return 'chef'
    case 'cocinero': {
      const plazaMap: Record<string, Rol> = {
        parrilla: 'parrilla',
        frios: 'frios',
        calientes: 'calientes',
        pase: 'pase',
        pasteleria: 'pasteleria',
        panaderia: 'panaderia',
        linea: 'linea',
      }
      return (plaza && plazaMap[plaza]) || 'linea'
    }
    case 'owner':
      return 'admin'
    case 'chef':
      return 'chef'
    case 'staff': {
      const plazaMap: Record<string, Rol> = {
        parrilla: 'parrilla',
        frios: 'frios',
        calientes: 'calientes',
        pase: 'pase',
        pasteleria: 'pasteleria',
        panaderia: 'panaderia',
        linea: 'linea',
      }
      return (plaza && plazaMap[plaza]) || 'ayudante'
    }
    case 'bachero':
      return 'ayudante'
    case 'compras':
      return 'admin'
    default:
      return (dbRol as Rol) ?? 'ayudante'
  }
}

// ── Types ─────────────────────────────────────────────────────
export interface PerfilAuth {
  nombre: string
  apellido: string
  rol: Rol
  initials: string
  color: string
  restaurante_id: string
  miembro_id: string | null
}

interface AuthContextType {
  user: User | null
  perfil: PerfilAuth | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, restauranteName: string, nombre?: string, apellido?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  isAdmin: boolean
  restauranteId: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<PerfilAuth | null>(null)
  const [loading, setLoading] = useState(true)
  // Fetch profile OUTSIDE of onAuthStateChange to avoid Supabase client deadlock
  useEffect(() => {
    if (!user) {
      setPerfil(null)
      return
    }
    let cancelled = false

    async function loadPerfil(u: User) {
      try {
        const [{ data: ur }, { data: miembro }] = await Promise.all([
          supabase.from('user_restaurantes').select('rol, restaurante_id').eq('user_id', u.id).maybeSingle(),
          supabase.from('equipo_miembros').select('id, nombre, apellido, plaza_asignada').eq('auth_user_id', u.id).maybeSingle(),
        ])

        if (cancelled) return
        if (!ur) {
          // During signUp, onAuthStateChange fires before DB rows are created.
          // Keep loading=true so RouteGuard shows spinner instead of lock screen.
          // signUp will directly set perfil after creating rows.
          setPerfil(null)
          setLoading(false)
          return
        }

        if (cancelled) return

        const nombre = miembro?.nombre ?? u.email?.split('@')[0] ?? 'User'
        const apellido = miembro?.apellido ?? ''
        const rol = mapRol(ur.rol, miembro?.plaza_asignada)

        setPerfil({
          nombre,
          apellido,
          rol,
          initials: getInitials(nombre, apellido),
          color: pickColor(u.id),
          restaurante_id: ur.restaurante_id,
          miembro_id: miembro?.id ?? null,
        })
        setLoading(false)
      } catch {
        if (!cancelled) {
          setPerfil(null)
          setLoading(false)
        }
      }
    }

    loadPerfil(user)
    return () => { cancelled = true }
  }, [user, supabase])

  // On mount — resolve auth user only (no DB queries here)
  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (!session?.user) setLoading(false)
      },
    )

    // Also try getSession as fallback
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (!session?.user) setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  // ── Sign In ───────────────────────────────────────────────
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      return { error: null }
    },
    [supabase],
  )

  // ── Sign Up ───────────────────────────────────────────────
  const signUp = useCallback(
    async (email: string, password: string, restauranteName: string, nombre?: string, apellido?: string) => {
      console.log('[signUp] Starting registration for:', email)

      // 1) Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) { console.error('[signUp] Step 1 FAIL — auth:', authError.message); return { error: authError.message } }

      const userId = authData.user?.id
      if (!userId) { console.error('[signUp] Step 1 FAIL — no userId'); return { error: 'No se pudo crear el usuario' } }
      console.log('[signUp] Step 1 OK — userId:', userId)

      // 2) Create restaurante (generate UUID client-side to avoid SELECT-back RLS issue)
      const restauranteId = crypto.randomUUID()
      const { error: restError } = await supabase
        .from('restaurantes')
        .insert({ id: restauranteId, nombre: restauranteName })

      if (restError) { console.error('[signUp] Step 2 FAIL — restaurante:', restError.message, restError.details, restError.hint); return { error: restError.message } }
      console.log('[signUp] Step 2 OK — restaurante_id:', restauranteId)

      // 3) Link user to restaurante as admin
      const { error: linkError } = await supabase
        .from('user_restaurantes')
        .insert({ user_id: userId, restaurante_id: restauranteId, rol: 'admin' })

      if (linkError) { console.error('[signUp] Step 3 FAIL — user_restaurantes:', linkError.message, linkError.details); return { error: linkError.message } }
      console.log('[signUp] Step 3 OK — user_restaurantes linked')

      // 4) Create equipo_miembros entry
      const miembroNombre = nombre || email.split('@')[0]
      const miembroApellido = apellido || ''
      const { error: miembroError } = await supabase
        .from('equipo_miembros')
        .insert({
          nombre: miembroNombre,
          apellido: miembroApellido,
          rol: 'admin',
          auth_user_id: userId,
          restaurante_id: restauranteId,
          activo: true,
        })

      if (miembroError) { console.error('[signUp] Step 4 FAIL — equipo_miembros:', miembroError.message, miembroError.details); return { error: miembroError.message } }

      // 5) Seed default rol_permisos for the new restaurant
      const TODOS_LOS_MODULOS = [
        'home', 'operaciones', 'tareas', 'recetario', 'stock', 'carta', 'checklist', 'pase',
        'pedidos', 'proveedores', 'facturas', 'reportes', 'turnos', 'calendario',
        'haccp', 'equipo', 'configuracion', 'produccion', 'merma', 'ventas',
      ]
      const rolPermisos = [
        {
          restaurante_id: restauranteId,
          rol: 'admin',
          modulos_visibles: TODOS_LOS_MODULOS,
          puede_editar_stock: true,
          puede_editar_recetas: true,
          puede_editar_carta: true,
          puede_editar_equipo: true,
          puede_eliminar: true,
        },
        {
          restaurante_id: restauranteId,
          rol: 'sous_chef',
          modulos_visibles: TODOS_LOS_MODULOS.filter((m) => m !== 'configuracion'),
          puede_editar_stock: true,
          puede_editar_recetas: true,
          puede_editar_carta: true,
          puede_editar_equipo: true,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'cocinero',
          modulos_visibles: ['inicio', 'tareas', 'recetario', 'stock', 'checklist', 'pase', 'produccion'],
          puede_editar_stock: false,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'bachero',
          modulos_visibles: ['inicio', 'tareas', 'checklist', 'pase'],
          puede_editar_stock: false,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
        {
          restaurante_id: restauranteId,
          rol: 'compras',
          modulos_visibles: ['inicio', 'stock', 'pedidos', 'proveedores', 'facturas', 'calendario'],
          puede_editar_stock: true,
          puede_editar_recetas: false,
          puede_editar_carta: false,
          puede_editar_equipo: false,
          puede_eliminar: false,
        },
      ]

      const { error: permisosError } = await supabase
        .from('rol_permisos')
        .insert(rolPermisos)

      if (permisosError) { console.error('[signUp] Step 5 FAIL — rol_permisos:', permisosError.message, permisosError.details); return { error: permisosError.message } }
      console.log('[signUp] Step 5 OK — rol_permisos seeded')

      console.log('[signUp] ✅ Registration complete for:', email)

      // Directly set perfil — don't wait for loadPerfil to re-query.
      // The first loadPerfil (triggered by onAuthStateChange) ran before these
      // DB rows existed, so it found nothing. Setting perfil here ensures the
      // app transitions immediately to the dashboard.
      const finalNombre = nombre || email.split('@')[0]
      const finalApellido = apellido || ''
      setPerfil({
        nombre: finalNombre,
        apellido: finalApellido,
        rol: 'admin',
        initials: getInitials(finalNombre, finalApellido),
        color: pickColor(userId),
        restaurante_id: restauranteId,
        miembro_id: null, // will be populated on next loadPerfil
      })
      setLoading(false)

      return { error: null }
    },
    [supabase],
  )

  // ── Sign Out ──────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setPerfil(null)
    // Force full page reload to clear server-side session cookie
    window.location.href = '/login'
  }, [supabase])

  const value: AuthContextType = {
    user,
    perfil,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: perfil?.rol === 'admin',
    restauranteId: perfil?.restaurante_id ?? null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
