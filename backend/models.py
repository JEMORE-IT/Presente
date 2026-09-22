import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

class Socio(Base):
    __tablename__ = "soci"

    id = Column(Integer, primary_key=True)
    nome = Column(String, nullable=False)
    ruolo = Column(String, nullable=True)
    area_lavoro = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    stato = Column(String, default="ATTIVO", nullable=False)  # "ATTIVO" or "ALUMNI"

    # Relationships
    presenze = relationship("Presenza", foreign_keys="[Presenza.socio_id]", back_populates="socio", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Socio {self.id}: {self.nome} ({self.email})>"


class Evento(Base):
    __tablename__ = "eventi"

    id = Column(Integer, primary_key=True, autoincrement=True)
    titolo = Column(String, nullable=False)
    tipo = Column(String, nullable=False)  # "ASSEMBLEA", "FORMAZIONE", "TEAM_BUILDING"
    data_ora = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    modalita = Column(String, nullable=False)  # "ONLINE_ONLY", "HYBRID", "IN_PERSON_ONLY"
    soglia_consecutiva = Column(Integer, default=3, nullable=False)
    is_attivo = Column(Boolean, default=True, nullable=False)
    form_slug = Column(String, unique=True, index=True, nullable=True)

    # Relationships
    presenze = relationship("Presenza", back_populates="evento", cascade="all, delete-orphan")
    unmatched_logs = relationship("UnmatchedLog", back_populates="evento", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Evento {self.id}: {self.titolo} ({self.tipo})>"


class Presenza(Base):
    __tablename__ = "presenze"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evento_id = Column(Integer, ForeignKey("eventi.id", ondelete="CASCADE"), nullable=False)
    socio_id = Column(Integer, ForeignKey("soci.id", ondelete="CASCADE"), nullable=False)
    modalita = Column(String, nullable=False)  # "IN_PRESENZA", "ONLINE", "GIUSTIFICATO", "PRE_REGISTRATO", "ASSENTE"
    delega_a = Column(String, nullable=True)  # Name or email of proxy delegate
    intolleranze = Column(String, nullable=True)  # Food intolerances

    # Proxy tracking
    delegante_id = Column(Integer, ForeignKey("soci.id", ondelete="CASCADE"), nullable=True)
    delegato_id = Column(Integer, ForeignKey("soci.id", ondelete="SET NULL"), nullable=True)
    
    durata_minuti = Column(Integer, default=0, nullable=False)
    registrato_il = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    
    is_preregistrato = Column(Boolean, default=False, nullable=False)

    # Relationships
    evento = relationship("Evento", back_populates="presenze")
    socio = relationship("Socio", foreign_keys=[socio_id], back_populates="presenze")
    delegante = relationship("Socio", foreign_keys=[delegante_id])
    delegato = relationship("Socio", foreign_keys=[delegato_id])

    # Enforce uniqueness of (evento_id, socio_id) to avoid double check-ins
    __table_args__ = (
        UniqueConstraint("evento_id", "socio_id", name="uix_evento_socio"),
    )

    def __repr__(self):
        return f"<Presenza: socio={self.socio_id} evento={self.evento_id} modalita={self.modalita}>"


class UnmatchedLog(Base):
    __tablename__ = "unmatched_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    evento_id = Column(Integer, ForeignKey("eventi.id", ondelete="CASCADE"), nullable=False)
    email = Column(String, nullable=True)
    nome_rilevato = Column(String, nullable=False)
    durata_minuti = Column(Integer, default=0, nullable=False)
    registrato_il = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)

    # Relationships
    evento = relationship("Evento", back_populates="unmatched_logs")

    def __repr__(self):
        return f"<UnmatchedLog: evento={self.evento_id} email={self.email} nome={self.nome_rilevato}>"
