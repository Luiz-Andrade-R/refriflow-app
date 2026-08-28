import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { Tela } from '../App'
import { STATUS_LABELS } from '../types'

interface Props {
  session: Session
  onNavigate: (tela: Tela) => void
}

export default function Painel({ session, onNavigate }: Props) {
  const [contadorGestor, setContadorGestor] = useState(0)
  const [contadorDiagnostico, setContadorDiagnostico] = useState(0)
  const [perfil, setPerfil] = useState('')

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    const { data: userData } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', session.user.id)
      .single()

    if (userData?.perfil) setPerfil(userData.perfil)

    const { count: countGestor } = await supabase
      .from('atendimentos')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'AGUARDANDO_VALIDACAO_GESTOR')

    if (countGestor !== null) setContadorGestor(countGestor)

    const { count: countDiag } = await supabase
      .from('atendimentos')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'EM_DIAGNOSTICO')

    if (countDiag !== null) setContadorDiagnostico(countDiag)
  }

  function sair() {
    supabase.auth.signOut()
  }

  const cards = [
    { titulo: 'Novo Atendimento', desc: 'Abrir um novo atendimento', tela: 'novo' as Tela, cor: 'bg-blue-600' },
    { titulo: 'Atendimentos', desc: 'Lista de atendimentos', tela: 'lista' as Tela, cor: 'bg-green-600' },
    { titulo: 'Central do Gestor', desc: `${contadorGestor} aguardando validação`, tela: 'gestor' as Tela, cor: 'bg-orange-600' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">REFRIFLOW</h1>
          <p className="text-blue-200 text-sm">{perfil || 'ADMIN'}</p>
        </div>
        <button
          onClick={sair}
          className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg text-sm"
        >
          Sair
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Painel</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.titulo}
              onClick={() => onNavigate(card.tela)}
              className={`${card.cor} text-white rounded-xl p-6 text-left hover:opacity-90 transition-opacity shadow-lg`}
            >
              <h3 className="text-lg font-bold mb-1">{card.titulo}</h3>
              <p className="text-sm opacity-90">{card.desc}</p>
            </button>
          ))}
        </div>

        {contadorDiagnostico > 0 && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-blue-800 text-sm">
              <strong>{contadorDiagnostico}</strong> atendimento(s) em diagnóstico técnico
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
