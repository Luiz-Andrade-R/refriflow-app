import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Login from './components/Login'
import Painel from './components/Painel'
import NovoAtendimento from './components/NovoAtendimento'
import Garantia from './components/Garantia'
import Checklist from './components/Checklist'
import ListaAtendimentos from './components/ListaAtendimentos'
import CentralGestor from './components/CentralGestor'
import OrdemServico from './components/OrdemServico'

export type Tela = 'painel' | 'novo' | 'garantia' | 'checklist' | 'lista' | 'gestor' | 'os'

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
        <Painel session={session} onNavigate={(t: Tela) => setTela(t)} />
      )}
      {tela === 'novo' && (
        <NovoAtendimento
          onBack={() => setTela('painel')}
          onComplete={(id: string) => {
            setAtendimentoSelecionado(id)
            setTela('garantia')
          }}
        />
      )}
      {tela === 'garantia' && atendimentoSelecionado && (
        <Garantia
          atendimentoId={atendimentoSelecionado}
          onBack={() => setTela('painel')}
          onLiberar={() => setTela('checklist')}
        />
      )}
      {tela === 'checklist' && atendimentoSelecionado && (
        <Checklist
          atendimentoId={atendimentoSelecionado}
          onBack={() => setTela('lista')}
          onComplete={() => setTela('lista')}
        />
      )}
      {tela === 'lista' && (
        <ListaAtendimentos
          onBack={() => setTela('painel')}
          onOpenAtendimento={(id: string, status: string) => {
            setAtendimentoSelecionado(id)
            if (status === 'AGUARDANDO_GARANTIA') {
              setTela('garantia')
            } else if (status === 'EM_DIAGNOSTICO' || status === 'DEVOLVIDO_AO_TECNICO') {
              setTela('checklist')
            } else if (status === 'AGUARDANDO_VALIDACAO_GESTOR') {
              setTela('gestor')
            } else {
              setTela('os')
            }
          }}
        />
      )}
      {tela === 'gestor' && atendimentoSelecionado && (
        <CentralGestor
          session={session}
          atendimentoId={atendimentoSelecionado}
          onBack={() => setTela('lista')}
        />
      )}
      {tela === 'os' && atendimentoSelecionado && (
        <OrdemServico
          atendimentoId={atendimentoSelecionado}
          onBack={() => setTela('lista')}
        />
      )}
    </div>
  )
}
