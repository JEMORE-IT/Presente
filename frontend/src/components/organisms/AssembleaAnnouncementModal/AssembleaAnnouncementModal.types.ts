export interface AssembleaAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventTitle: string;
  currentCount: number;
  quorumNeeded: number;
  isQuorumReached: boolean;
  onDeclare: (phrase: string) => void;
}
