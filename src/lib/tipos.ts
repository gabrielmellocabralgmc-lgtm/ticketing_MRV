export type Papel = "admin" | "marketing" | "responsavel" | "operacao";
export type Setor = "camarote" | "arquibancada" | "pista";
export type StatusEvento = "rascunho" | "aberto" | "fechado" | "realizado" | "encerrado";
export type StatusIngresso =
  | "convite_enviado" | "aguardando_preenchimento" | "solicitado" | "validado_area" | "aprovado"
  | "facial_pendente" | "facial_ok" | "enviado" | "confirmado" | "presente"
  | "convite_expirado" | "lista_espera" | "recusado" | "cancelado" | "no_show";

export interface Evento {
  id: string;
  tipo: "jogo" | "show";
  titulo: string;
  adversario: string | null;
  atracao: string | null;
  competicao: string | null;
  show_proprio: boolean | null;
  inicio: string;
  abertura_portoes: string | null;
  prazo_solicitacao: string | null;
  prazo_validacao: string | null;
  concorrido: boolean;
  status: StatusEvento;
  observacoes: string | null;
}

export interface Saldo {
  capacidade: number;
  ocupados_setor: number;
  cota: number | null;
  ocupados_area: number;
  saldo: number;
  em_espera: number;
  cota_por_area: boolean;
}

export const ROTULO_SETOR: Record<Setor, string> = {
  camarote: "Camarote",
  arquibancada: "Arquibancada (Inter Oeste)",
  pista: "Pista",
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Admin",
  marketing: "Marketing MRV",
  responsavel: "Responsável de área",
  operacao: "Operação do camarote",
};

export const ROTULO_STATUS_EVENTO: Record<StatusEvento, string> = {
  rascunho: "Rascunho",
  aberto: "Aberto para solicitações",
  fechado: "Prazo encerrado",
  realizado: "Realizado",
  encerrado: "Encerrado",
};

export const STATUS_INGRESSO: Record<StatusIngresso, { rotulo: string; tom: "cinza" | "azul" | "amarelo" | "verde" | "laranja" | "vermelho" }> = {
  convite_enviado: { rotulo: "Convite enviado", tom: "cinza" },
  aguardando_preenchimento: { rotulo: "Aguardando preenchimento", tom: "amarelo" },
  solicitado: { rotulo: "Preenchido", tom: "azul" },
  validado_area: { rotulo: "Validado pela área", tom: "azul" },
  aprovado: { rotulo: "Pendente facial", tom: "vermelho" },
  facial_pendente: { rotulo: "Pendente facial", tom: "vermelho" },
  facial_ok: { rotulo: "Pronto para envio", tom: "verde" },
  enviado: { rotulo: "Enviado", tom: "verde" },
  confirmado: { rotulo: "Confirmado", tom: "verde" },
  presente: { rotulo: "Presente", tom: "verde" },
  convite_expirado: { rotulo: "Convite expirado", tom: "cinza" },
  lista_espera: { rotulo: "Lista de espera", tom: "amarelo" },
  recusado: { rotulo: "Recusado", tom: "vermelho" },
  cancelado: { rotulo: "Cancelado", tom: "cinza" },
  no_show: { rotulo: "No-show", tom: "vermelho" },
};

/** Status que ainda ocupam lugar (espelha status_consome no banco). */
export const STATUS_ATIVOS: StatusIngresso[] = [
  "convite_enviado", "aguardando_preenchimento", "solicitado", "validado_area", "aprovado",
  "facial_pendente", "facial_ok", "enviado", "confirmado", "presente", "no_show",
];
