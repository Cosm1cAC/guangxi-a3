# -*- coding: utf-8 -*-
"""Convert the A3 rules Markdown into a formatted DOCX."""
import io
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parent
SRC = str(ROOT / "广西A3（尖3）棋牌规则.md")
DST = str(ROOT / "docs" / "广西A3（尖3）棋牌规则.docx")

CN_FONT = "Microsoft YaHei"
CODE_FONT = "Consolas"
DARK = RGBColor(0x1F, 0x3A, 0x5F)
MID = RGBColor(0x2E, 0x5C, 0x8A)
GRAY = RGBColor(0x59, 0x59, 0x59)
LIGHT = RGBColor(0x7F, 0x7F, 0x7F)


def set_run_font(run, size=None, bold=None, color=None, font=CN_FONT,
                 italic=None, underline=None):
    run.font.name = font
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), font)
    rFonts.set(qn("w:hAnsi"), font)
    rFonts.set(qn("w:eastAsia"), CN_FONT)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color
    if italic is not None:
        run.italic = italic
    if underline is not None:
        run.font.underline = underline


def add_runs(p, text, size=10.5, bold=False, color=None, italic=None):
    """Add text with **bold**, `code`, and <url> handling."""
    parts = re.split(r"(\*\*.*?\*\*|`.*?`|<https?://[^>]+>)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = p.add_run(part[2:-2])
            set_run_font(run, size=size, bold=True, color=color, italic=italic)
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = p.add_run(part[1:-1])
            set_run_font(run, size=size - 0.5, bold=bold, color=color,
                         font=CODE_FONT, italic=italic)
        elif part.startswith("<http") and part.endswith(">"):
            run = p.add_run(part[1:-1])
            set_run_font(run, size=size - 0.5, bold=bold,
                         color=RGBColor(0x1F, 0x4E, 0x79), underline=True,
                         italic=italic)
        else:
            run = p.add_run(part)
            set_run_font(run, size=size, bold=bold, color=color, italic=italic)


def shade_cell(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def shade_paragraph(p, hex_fill):
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    pPr.append(shd)


def add_bottom_border(p, color="BFBFBF", sz="6"):
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), sz)
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), color)
    pBdr.append(bottom)
    pPr.append(pBdr)


def add_page_field(paragraph):
    run = paragraph.add_run()
    fldChar = OxmlElement("w:fldChar")
    fldChar.set(qn("w:fldCharType"), "begin")
    instrText = OxmlElement("w:instrText")
    instrText.set(qn("xml:space"), "preserve")
    instrText.text = " PAGE "
    fldChar2 = OxmlElement("w:fldChar")
    fldChar2.set(qn("w:fldCharType"), "end")
    run._r.append(fldChar)
    run._r.append(instrText)
    run._r.append(fldChar2)
    set_run_font(run, size=8.5, color=LIGHT)


def add_table(doc, rows):
    ncols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=ncols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    size = 8.5 if ncols >= 5 else 9.0
    for i, row in enumerate(rows):
        for j in range(ncols):
            text = row[j] if j < len(row) else ""
            cell = table.cell(i, j)
            cell.text = ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.0
            add_runs(p, text, size=size, bold=(i == 0),
                     color=RGBColor(0x1F, 0x1F, 0x1F) if i else None)
            if i == 0:
                shade_cell(cell, "D9E2F3")
    # repeat header row on page breaks
    tr = table.rows[0]._tr
    trPr = tr.get_or_add_trPr()
    tblHeader = OxmlElement("w:tblHeader")
    tblHeader.set(qn("w:val"), "true")
    trPr.append(tblHeader)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


def build():
    text = io.open(SRC, encoding="utf-8").read()
    lines = text.splitlines()

    doc = Document()

    # page setup
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    # normal style
    normal = doc.styles["Normal"]
    normal.font.name = CN_FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), CN_FONT)
    normal.paragraph_format.line_spacing = 1.25
    normal.paragraph_format.space_after = Pt(4)

    # heading styles
    for name, size, color in (("Heading 1", 16, DARK),
                              ("Heading 2", 13, MID),
                              ("Heading 3", 11.5, MID)):
        st = doc.styles[name]
        st.font.name = CN_FONT
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = color
        st.element.rPr.rFonts.set(qn("w:eastAsia"), CN_FONT)
        st.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
        st.paragraph_format.space_after = Pt(6)

    # header
    hp = section.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run("广西A3（尖3）棋牌规则")
    set_run_font(hr, size=8, color=LIGHT)

    # footer
    fp = section.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = fp.add_run("第 ")
    set_run_font(r1, size=8.5, color=LIGHT)
    add_page_field(fp)
    r2 = fp.add_run(" 页")
    set_run_font(r2, size=8.5, color=LIGHT)

    i = 0
    in_code = False
    code_lines = []

    def flush_code():
        nonlocal code_lines
        if not code_lines:
            return
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.5)
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.0
        shade_paragraph(p, "F2F2F2")
        for k, cl in enumerate(code_lines):
            if k:
                p.add_run().add_break()
            run = p.add_run(cl)
            set_run_font(run, size=9, font=CODE_FONT)
        code_lines = []

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip("\n")
        stripped = line.strip()

        if stripped.startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if not stripped:
            i += 1
            continue

        # horizontal rule
        if stripped == "---":
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            add_bottom_border(p)
            i += 1
            continue

        # headings
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            if level == 1:
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(18)
                p.paragraph_format.space_after = Pt(8)
                add_runs(p, title, size=22, bold=True, color=DARK)
                add_bottom_border(p, color="1F3A5F", sz="12")
            else:
                h = doc.add_heading(level=min(level - 1, 3))
                h.text = ""
                add_runs(h, title, size={2: 16, 3: 13, 4: 11.5}.get(level, 11),
                         bold=True, color=DARK if level == 2 else MID)
            i += 1
            continue

        # blockquote
        if stripped.startswith("> "):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                quote_lines.append(lines[i].strip()[2:].strip())
                i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.5)
            p.paragraph_format.right_indent = Cm(0.3)
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.15
            shade_paragraph(p, "F2F2F2")
            for k, ql in enumerate(quote_lines):
                if k:
                    p.add_run().add_break()
                add_runs(p, ql, size=9.5, color=GRAY, italic=True)
            continue

        # table
        if stripped.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            rows = []
            for bi, bl in enumerate(block):
                cells = [c.strip() for c in bl.strip("|").split("|")]
                if bi == 1 and all(re.match(r"^:?-+:?$", c) for c in cells):
                    continue
                rows.append(cells)
            if rows:
                add_table(doc, rows)
            continue

        # checkbox
        m = re.match(r"^-\s+\[[ xX]\]\s+(.*)$", stripped)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.6)
            p.paragraph_format.first_line_indent = Cm(-0.4)
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, "☐ " + m.group(1), size=10.5)
            i += 1
            continue

        # bullet list
        m = re.match(r"^(\s*)-\s+(.*)$", line)
        if m:
            indent = len(m.group(1))
            style_name = "List Bullet 2" if indent >= 2 else "List Bullet"
            p = doc.add_paragraph(style=style_name)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.2
            add_runs(p, m.group(2), size=10.5)
            i += 1
            continue

        # numbered list (keep explicit numbers to avoid restart issues)
        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(0.7)
            p.paragraph_format.first_line_indent = Cm(-0.45)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.2
            add_runs(p, f"{m.group(1)}. {m.group(2)}", size=10.5)
            i += 1
            continue

        # regular paragraph: join consecutive non-empty non-special lines
        para = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (not nxt or nxt.startswith("#") or nxt.startswith("|")
                    or nxt.startswith("> ") or nxt == "---"
                    or nxt.startswith("```") or re.match(r"^(\s*)-\s+", lines[i])
                    or re.match(r"^\d+\.\s+", nxt)):
                break
            para.append(nxt)
            i += 1
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        add_runs(p, "".join(para), size=10.5)

    flush_code()
    doc.save(DST)
    print("saved", DST)


if __name__ == "__main__":
    build()
