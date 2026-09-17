export interface AssembleaAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  announcedTime?: string | null;
}
