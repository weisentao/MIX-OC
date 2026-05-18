from pathlib import Path
from pypdf import PdfReader

PDF_PATH = Path(r"E:\xwechat_files\wxid_33wm4afdyg1p22_5695\msg\file\2026-05\任务流程优化修改(1).pdf")
OUT_PATH = Path("docs/pdf-任务流程优化修改.md")

reader = PdfReader(str(PDF_PATH))
sections = [f"# 任务流程优化修改 PDF 提取文档\n\n页数：{len(reader.pages)}\n"]

for index, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    sections.append(f"\n## 第 {index} 页\n\n{text}\n")

OUT_PATH.parent.mkdir(exist_ok=True)
OUT_PATH.write_text("\n".join(sections), encoding="utf-8")
print(str(OUT_PATH))
