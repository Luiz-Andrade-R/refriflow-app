import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  atendimentoId: string
  onBack: () => void
  onLiberar: () => void
}

interface Atendimento {
  id: string
  numero: number
  tipo_atendimento: string
  subtipo_revisao: string | null
  clientes: { razao_social: string } | null
  veiculos: { placa_traseira: string } | null
  equipamentos: { modelo: string; numero_serie: string } | null
  modelos_equipamentos: { categoria: string; carga_refrigerante_padrao: number | null } | null
}

export default function Garantia({ atendimentoId, onBack, onLiberar }: Props) {
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null)
  const [dataInstalacao, setDataInstalacao] = useState('')
  const [garantiaStatus, setGarantiaStatus] = useState('')
  const [fimIntegral, setFimIntegral] = useState('')
  const [fimMotor, setFimMotor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    const { data } = await supabase
      .from('atendimentos')
      .select(`
        id, numero, tipo_atendimento, subtipo_revisao,
        clientes ( razao_social ),
        veiculos ( placa_traseira ),
        equipamentos ( modelo, numero_serie )
      `)
      .eq('id', atendimentoId)
      .single()

    if (data) {
      const atend = data as unknown as Atendimento
      setAtendimento(atend)

      const { data: modeloData } = await supabase
        .from('modelos_equipamentos')
        .select('categoria, carga_refrigerante_padrao')
        .eq('nome', atend.equipamentos?.modelo)
        .single()

      if (modeloData) {
        atend.modelos_equipamentos = modeloData
        setAtendimento({ ...atend })
      }
    }
    setLoading(false)
  }

  function calcularGarantia() {
    if (!dataInstalacao || !atendimento?.modelos_equipamentos?.categoria) return

    const instalacao = new Date(dataInstalacao)
    const categoria = atendimento.modelos_equipamentos.categoria

    const integral = new Date(instalacao)
    integral.setFullYear(integral.getFullYear() + 1)
    setFimIntegral(integral.toISOString().split('T')[0])

    if (categoria === 'diesel') {
      const motor = new Date(instalacao)
      motor.setFullYear(motor.getFullYear() + 2)
      setFimMotor(motor.toISOString().split('T')[0])
    }

    const hoje = new Date()
    if (hoje <= integral) {
      setGarantiaStatus('EM_GARANTIA')
    } else {
      setGarantiaStatus('FORA_GARANTIA')
    }
  }

  async function liberar() {
    setSalvando(true)

    await supabase
      .from('atendimentos')
      .update({
        status: 'EM_DIAGNOSTICO',
        garantia_status: garantiaStatus || 'NAO_APLICAVEL',
        garantia_data_instalacao: dataInstalacao || null,
        garantia_fim_integral: fimIntegral || null,
        garantia_fim_motor: fimMotor || null,
      })
      .eq('id', atendimentoId)

    await supabase.from('historico_status').insert({
      atendimento_id: atendimentoId,
      status_anterior: 'AGUARDANDO_GARANTIA',
      status_novo: 'EM_DIAGNOSTICO',
      observacao: observacao || 'Garantia liberada',
    })

    setSalvando(false)
    onLiberar()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Carregando...</div>
      </div>
    )
  }

  const categoria = atendimento?.modelos_equipamentos?.categoria || ''

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4">
        <div className="flex items-center gap-4 mb-2">
          <button onClick={onBack} className="text-blue-200 hover:text-white">← Voltar</button>
          <h1 className="text-lg font-bold">Consulta de Garantia</h1>
        </div>
        {atendimento && (
          <div className="text-sm text-blue-200">
            #{atendimento.numero} • {atendimento.clientes?.razao_social || '—'} •{' '}
            {atendimento.equipamentos?.modelo || '—'}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="border-b border-gray-100 pb-4">
            <h2 className="font-bold text-gray-800 mb-2">Dados do Equipamento</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400">Modelo</p>
                <p className="text-gray-800">{atendimento?.equipamentos?.modelo || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Série</p>
                <p className="text-gray-800">{atendimento?.equipamentos?.numero_serie || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Categoria</p>
                <p className="text-gray-800">{categoria || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Tipo</p>
                <p className="text-gray-800">
                  {atendimento?.tipo_atendimento === 'REVISAO'
                    ? `Revisão ${atendimento?.subtipo_revisao || ''}`
                    : 'Serviço Comum'}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data de instalação</label>
            <input
              type="date"
              value={dataInstalacao}
              onChange={(e) => setDataInstalacao(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>

          <button
            onClick={calcularGarantia}
            disabled={!dataInstalacao}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Calcular Garantia
          </button>

          {garantiaStatus && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  garantiaStatus === 'EM_GARANTIA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {garantiaStatus === 'EM_GARANTIA' ? 'Em Garantia' : 'Fora de Garantia'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">Fim da garantia integral</p>
                  <p className="text-gray-800">{fimIntegral || '—'}</p>
                </div>
                {categoria === 'diesel' && (
                  <div>
                    <p className="text-gray-400">Fim da garantia motor/compressor</p>
                    <p className="text-gray-800">{fimMotor || '—'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm"
              placeholder="Observações sobre a garantia..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onBack} className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600 hover:bg-gray-50">
              Voltar
            </button>
            <button
              onClick={liberar}
              disabled={salvando}
              className="flex-1 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {salvando ? 'Liberando...' : 'Liberar para Diagnóstico'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
