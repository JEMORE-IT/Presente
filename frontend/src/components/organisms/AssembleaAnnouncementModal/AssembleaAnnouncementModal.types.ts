export interface AssembleaAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  type?: "start" | "end";
  announcedTime?: string | null;
}
