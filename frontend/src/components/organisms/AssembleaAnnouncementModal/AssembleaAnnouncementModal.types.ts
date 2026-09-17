export interface AssembleaAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  onDeclare: (time: string) => void;
}
