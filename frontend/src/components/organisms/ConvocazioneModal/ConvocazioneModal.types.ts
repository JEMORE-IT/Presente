export interface ConvocazioneModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    id: number;
    titolo: string;
    data_ora: string;
    luogo?: string;
    form_slug?: string;
    tipo_assemblea?: string;
  } | null;
  onProceedToDashboard?: (eventId: number) => void;
}

