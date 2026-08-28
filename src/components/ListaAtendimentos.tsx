import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onBack: () => void
  onOpenAtendimento: (id: string) => void
}

interface Atendimento {
  id: string
  numero: number
  status: string
  tipo_servico: string
  responsavel_nome: string
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string } | null
}

export default function ListaAtendimentos({ onBack, onOpenAtendimento }: Props) {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, status, tipo_servico, responsavel_nome,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo )
      `)
      .order('numero', { ascending: false })

    if (error) {
      console.error(error)
    } else if (data) {
      setAtendimentos(data as unknown as Atendimento[])
    }
    setLoading(false)
  }

  const filtrados = atendimentos.filter((a) => {
    const termo = busca.toLowerCase()
    return (
      a.numero.toString().includes(termo) ||
      (a.clientes?.razao_social || '').toLowerCase().includes(termo) ||
      (a.veiculos?.placa_traseira || '').toLowerCase().includes(termo) ||
      (a.equipamentos?.modelo || '').toLowerCase().includes(termo)
    )
  })

  const statusCores: Record<string, string> = {
    AGUARDANDO_GARANTIA: 'bg-yellow-100 text-yellow-800',
    EM_ANALISE_TECNICA: 'bg-blue-100 text-blue-800',
    AGUARDANDO_VALIDACAO_GESTOR: 'bg-orange-100 text-orange-800',
    AGUARDANDO_ORCAMENTO: 'bg-purple-100 text-purple-800',
  }

  const statusLabels: Record<string, string> = {
    AGUARDANDO_GARANTIA: 'Aguardando Garantia',
    EM_ANALISE_TECNICA: 'Em Análise Técnica',
    AGUARDANDO_VALIDACAO_GESTOR: 'Aguardando Validação',
    AGUARDANDO_ORCAMENTO: 'Aguardando Orçamento',
  }

  function acaoLabel(status: string): string {
    if (status === 'AGUARDANDO_GARANTIA') return 'Consultar Garantia'
    if (status === 'EM_ANALISE_TECNICA') return 'Iniciar Checklist'
    if (status === 'AGUARDANDO_VALIDACAO_GESTOR') return 'Ver Diagnóstico'
    if (status === 'AGUARDANDO_ORCAMENTO') return 'Ver Orçamento'
    return 'Ver'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4 flex items-center gap-4">
        <button onClick={onBack} className="text-blue-200 hover:text-white">
          ← Voltar
        </button>
        <h1 className="text-lg font-bold">Atendimentos</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, cliente, placa ou modelo..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-6"
        />

        {loading ? (
          <p className="text-gray-500 text-center py-8">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum atendimento encontrado.</p>
        ) : (
          <div className="space-y-3">
            {filtrados.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800">#{a.numero}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${statusCores[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[a.status] || a.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {a.clientes?.razao_social || '—'} • {a.veiculos?.placa_traseira || '—'} • {a.equipamentos?.modelo || '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {a.tipo_servico} • {a.responsavel_nome || '—'}
                  </p>
                </div>
                <button
                  onClick={() => onOpenAtendimento(a.id)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap"
                >
                  {acaoLabel(a.status)}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
