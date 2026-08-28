import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onBack: () => void
  onComplete: () => void
}

interface Cliente {
  id: string
  razao_social: string
}

interface Veiculo {
  id: string
  placa_traseira: string
  cliente_id: string
}

interface Equipamento {
  id: string
  modelo: string
  numero_serie: string
  veiculo_id: string
}

interface ModeloEquip {
  id: string
  nome: string
  categoria: string
}

const TIPOS_SERVICO = ['CORRETIVA', 'PREVENTIVA', 'GARANTIA', 'REVISAO', 'INSTALACAO', 'OUTRO']

export default function NovoAtendimento({ onBack, onComplete }: Props) {
  const [etapa, setEtapa] = useState(1)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([])
  const [modelos, setModelos] = useState<ModeloEquip[]>([])

  const [clienteId, setClienteId] = useState('')
  const [novoCliente, setNovoCliente] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [telefone, setTelefone] = useState('')
  const [relato, setRelato] = useState('')
  const [placa, setPlaca] = useState('')
  const [modeloId, setModeloId] = useState('')
  const [numeroSerie, setNumeroSerie] = useState('')
  const [semSerie, setSemSerie] = useState(false)
  const [tipoServico, setTipoServico] = useState('')
  const [horaChave, setHoraChave] = useState('')
  const [horaMotor, setHoraMotor] = useState('')
  const [horaEletrica, setHoraEletrica] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    const { data: c } = await supabase.from('clientes').select('id, razao_social').order('razao_social')
    if (c) setClientes(c)

    const { data: m } = await supabase
      .from('modelos_equipamentos')
      .select('id, nome, categoria')
      .eq('ativo', true)
      .order('nome')
    if (m) setModelos(m)
  }

  function normalizarTelefone(t: string) {
    const digits = t.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 11
  }

  function normalizarPlaca(p: string) {
    return p.toUpperCase().replace(/[^A-Z0-9]/g, '')
  }

  function validarPlaca(p: string) {
    const limpa = normalizarPlaca(p)
    if (limpa.length !== 7) return false
    const antigo = /^[A-Z]{3}[0-9]{4}$/.test(limpa)
    const mercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(limpa)
    return antigo || mercosul
  }

  async function buscarVeiculosPorCliente(cid: string) {
    const { data } = await supabase
      .from('veiculos')
      .select('id, placa_traseira, cliente_id')
      .eq('cliente_id', cid)
    if (data) setVeiculos(data)
  }

  async function salvar() {
    setErro('')
    setSalvando(true)

    try {
      let cidFinal = clienteId

      if (!clienteId && novoCliente) {
        const { data: novoC, error: errC } = await supabase
          .from('clientes')
          .insert({ razao_social: novoCliente })
          .select('id')
          .single()
        if (errC) throw errC
        cidFinal = novoC.id
      }

      if (!cidFinal) {
        setErro('Selecione ou cadastre um cliente')
        setSalvando(false)
        return
      }

      const placaNormalizada = normalizarPlaca(placa)
      const { data: veic, error: errV } = await supabase
        .from('veiculos')
        .insert({
          placa_traseira: placaNormalizada,
          cliente_id: cidFinal,
        })
        .select('id')
        .single()
      if (errV) throw errV

      const serieFinal = semSerie ? 'N/A' : numeroSerie
      const { data: equip, error: errE } = await supabase
        .from('equipamentos')
        .insert({
          modelo: modelos.find(m => m.id === modeloId)?.nome || '',
          numero_serie: serieFinal,
          veiculo_id: veic.id,
        })
        .select('id')
        .single()
      if (errE) throw errE

      const { data: atend, error: errA } = await supabase
        .from('atendimentos')
        .insert({
          cliente_id: cidFinal,
          veiculo_id: veic.id,
          equipamento_id: equip.id,
          responsavel_nome: responsavel,
          responsavel_telefone: telefone.replace(/\D/g, ''),
          relato_entrada: relato,
          tipo_servico: tipoServico,
          hora_chave: horaChave ? parseFloat(horaChave) : null,
          hora_motor: horaMotor ? parseFloat(horaMotor) : null,
          hora_eletrica: horaEletrica ? parseFloat(horaEletrica) : null,
          status: 'AGUARDANDO_GARANTIA',
        })
        .select('numero')
        .single()
      if (errA) throw errA

      onComplete()
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar atendimento')
    }
    setSalvando(false)
  }

  function proximo() {
    setErro('')

    if (etapa === 1 && !clienteId && !novoCliente) {
      setErro('Selecione um cliente ou digite o nome de um novo')
      return
    }
    if (etapa === 2) {
      if (!responsavel) { setErro('Informe o responsável'); return }
      if (!normalizarTelefone(telefone)) { setErro('Telefone inválido. Use DDD + número (10 ou 11 dígitos)'); return }
    }
    if (etapa === 3 && !relato) { setErro('Descreva o relato de entrada'); return }
    if (etapa === 4) {
      if (!validarPlaca(placa)) { setErro('Placa inválida. Use 7 caracteres (ABC1234 ou ABC1D23)'); return }
    }
    if (etapa === 5 && !modeloId) { setErro('Selecione o modelo'); return }
    if (etapa === 6 && !tipoServico) { setErro('Selecione o tipo de serviço'); return }

    if (etapa < 8) setEtapa(etapa + 1)
    else salvar()
  }

  function voltar() {
    if (etapa > 1) setEtapa(etapa - 1)
    else onBack()
  }

  const titulos = [
    'Cliente',
    'Responsável e Contato',
    'Relato do Atendimento',
    'Veículo',
    'Equipamento',
    'Tipo de Serviço',
    'Horímetros',
    'Revisão e Confirmação',
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-900 text-white px-4 py-4 flex items-center gap-4">
        <button onClick={voltar} className="text-blue-200 hover:text-white">
          ← Voltar
        </button>
        <h1 className="text-lg font-bold">Novo Atendimento</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          {titulos.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${i + 1 <= etapa ? 'bg-blue-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-4">Etapa {etapa} de 8</p>
        <h2 className="text-xl font-bold text-gray-800 mb-6">{titulos[etapa - 1]}</h2>

        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          {etapa === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente existente</label>
                <select
                  value={clienteId}
                  onChange={(e) => {
                    setClienteId(e.target.value)
                    setNovoCliente('')
                    if (e.target.value) buscarVeiculosPorCliente(e.target.value)
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                >
                  <option value="">Selecione...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.razao_social}</option>
                  ))}
                </select>
              </div>
              <div className="text-center text-gray-400 text-sm">ou</div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Novo cliente</label>
                <input
                  type="text"
                  value={novoCliente}
                  onChange={(e) => { setNovoCliente(e.target.value); setClienteId('') }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Razão social do cliente"
                />
              </div>
            </>
          )}

          {etapa === 2 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                <input
                  type="text"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="Nome do responsável"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone (com DDD)</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </>
          )}

          {etapa === 3 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relato de entrada</label>
              <textarea
                value={relato}
                onChange={(e) => setRelato(e.target.value)}
                rows={5}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder="Descreva o problema ou motivo do atendimento..."
              />
            </div>
          )}

          {etapa === 4 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Placa do veículo</label>
              <input
                type="text"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                maxLength={7}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg uppercase"
                placeholder="ABC1D23"
              />
              <p className="text-xs text-gray-400 mt-1">Padrão antigo (ABC1234) ou Mercosul (ABC1D23)</p>
            </div>
          )}

          {etapa === 5 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo do equipamento</label>
                <select
                  value={modeloId}
                  onChange={(e) => setModeloId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                >
                  <option value="">Selecione...</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número de série</label>
                <input
                  type="text"
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value)}
                  disabled={semSerie}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  placeholder="Nº de série do equipamento"
                />
                <label className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={semSerie}
                    onChange={(e) => setSemSerie(e.target.checked)}
                  />
                  Não possui / N/A
                </label>
              </div>
            </>
          )}

          {etapa === 6 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de serviço</label>
              <div className="grid grid-cols-2 gap-3">
                {TIPOS_SERVICO.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTipoServico(t)}
                    className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                      tipoServico === t
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {etapa === 7 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora-chave</label>
                <input
                  type="number"
                  value={horaChave}
                  onChange={(e) => setHoraChave(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora-motor</label>
                <input
                  type="number"
                  value={horaMotor}
                  onChange={(e) => setHoraMotor(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora-elétrica</label>
                <input
                  type="number"
                  value={horaEletrica}
                  onChange={(e) => setHoraEletrica(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                  placeholder="0"
                />
              </div>
            </>
          )}

          {etapa === 8 && (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-800">Confirme os dados</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <p><strong>Cliente:</strong> {clienteId ? clientes.find(c => c.id === clienteId)?.razao_social : novoCliente}</p>
                <p><strong>Responsável:</strong> {responsavel}</p>
                <p><strong>Telefone:</strong> {telefone}</p>
                <p><strong>Placa:</strong> {normalizarPlaca(placa)}</p>
                <p><strong>Modelo:</strong> {modelos.find(m => m.id === modeloId)?.nome}</p>
                <p><strong>Série:</strong> {semSerie ? 'N/A' : numeroSerie}</p>
                <p><strong>Serviço:</strong> {tipoServico}</p>
                <p><strong>Hora-chave:</strong> {horaChave || '—'}</p>
                <p><strong>Hora-motor:</strong> {horaMotor || '—'}</p>
                <p><strong>Hora-elétrica:</strong> {horaEletrica || '—'}</p>
              </div>
            </div>
          )}

          {erro && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{erro}</div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={voltar}
            className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600 hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            onClick={proximo}
            disabled={salvando}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : etapa === 8 ? 'Confirmar' : 'Próximo'}
          </button>
        </div>
      </main>
    </div>
  )
}
