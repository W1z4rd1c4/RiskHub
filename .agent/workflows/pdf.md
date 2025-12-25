---
name: pdf
description: Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form or programmatically process, generate, or analyze PDF documents at scale.
source: anthropics/skills
license: Apache-2.0
---

# PDF Processing Guide

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("placeholder-pdf-020.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

### pypdf - Basic Operations

#### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["placeholder-pdf-016.pdf", "placeholder-pdf-017.pdf", "placeholder-pdf-018.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("placeholder-pdf-031.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PdfReader("placeholder-pdf-026.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"placeholder-pdf-034.pdf", "wb") as output:
        writer.write(output)
```

### pdfplumber - Text and Table Extraction

#### Extract Tables
```python
import pdfplumber
import pandas as pd

with pdfplumber.open("placeholder-pdf-020.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)
```

### reportlab - Create PDFs

```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("placeholder-pdf-025.pdf", pagesize=letter)
width, height = letter
c.drawString(100, height - 100, "Hello World!")
c.save()
```

## Command-Line Tools

```bash
# Extract text (poppler-utils)
pdftotext placeholder-pdf-026.pdf output.txt

# Merge PDFs (qpdf)
qpdf --empty --pages placeholder-pdf-023.pdf placeholder-pdf-024.pdf -- placeholder-pdf-031.pdf

# Split pages
qpdf placeholder-pdf-026.pdf --pages . 1-5 -- placeholder-pdf-035.pdf
```

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Create PDFs | reportlab | Canvas or Platypus |
| OCR scanned PDFs | pytesseract | Convert to image first |
