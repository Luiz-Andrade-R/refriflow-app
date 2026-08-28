import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Login from './components/Login'
import Painel from './components/Painel'
import NovoAtendimento from './components/NovoAtendimento'
import ListaAtendimentos from './components/ListaAtendimentos'
import Checklist from './components/Checklist'
import CentralGestor from './components/CentralGestor'

export type Tela = 'painel' | 'novo' | 'lista' | 'checklist' | 'gestor'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [tela, setTela] = useState<Tela>('painel')
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {tela === 'painel' && (
        <Painel
          session={session}
          onNavigate={(t: Tela) => setTela(t)}
        />
      )}
      {tela === 'novo' && (
        <NovoAtendimento
          onBack={() => setTela('painel')}
          onComplete={() => setTela('lista')}
        />
      )}
      {tela === 'lista' && (
        <ListaAtendimentos
          onBack={() => setTela('painel')}
          onOpenAtendimento={(id: string) => {
            setAtendimentoSelecionado(id)
            setTela('checklist')
          }}
        />
      )}
      {tela === 'checklist' && atendimentoSelecionado && (
        <Checklist
          atendimentoId={atendimentoSelecionado}
          onBack={() => setTela('lista')}
        />
      )}
      {tela === 'gestor' && (
        <CentralGestor
          session={session}
          onBack={() => setTela('painel')}
        />
      )}
    </div>
  )
}
