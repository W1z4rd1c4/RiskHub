from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._archivable import ArchivableMixin


class Threat(ArchivableMixin, Base):
    """ICT Register Threat — a source or cause that can give rise to a Risk.

    Carries the workbook's entered 12_Hrozby columns only (functional spec
    section 1.6): name, category (closed list KategorieHrozeb), description,
    typical weaknesses, relevant subject, and notes. The workbook's ID column
    is derived ("HR-"+row) and maps to the primary key here; Threats carry no
    derived block — they sit outside the criticality cascade.
    """

    __tablename__ = "threats"

    id: Mapped[int] = mapped_column(primary_key=True)

    # "Hrozba" — the threat name.
    name: Mapped[str] = mapped_column(String(255), index=True)
    # "Kategorie" — closed list KategorieHrozeb.
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    # "Popis"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "Typické zranitelnosti" — the weaknesses this threat typically exploits
    # (glossary: "vulnerability" is reserved away from Threat naming).
    typical_weaknesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "Relevantní subjekt" — free text in the workbook (no closed list).
    relevant_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # "Poznámka"
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
