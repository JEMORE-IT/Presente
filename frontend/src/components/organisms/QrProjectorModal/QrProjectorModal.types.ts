export interface QrProjectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: number | null;
  eventTitle?: string;
  onQrRegenerated?: () => void;
}
