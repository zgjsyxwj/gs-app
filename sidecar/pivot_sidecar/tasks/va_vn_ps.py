"""瓦里安越南 Payslip 重命名并去水印 (VA-VN-PAYSLIP-RENAME)

复制供应商 PDF → 按 {code}_{YYYYMM}.pdf 重命名 → 清除底部水印
("Payslip generate by AB GENιE")。原始文件保持只读。

水印移除策略 — 外科手术，不动其他内容、不画覆盖层：
  AB GENιE 模板把水印渲染成两个相邻的 `q…Q` 图形块：
    1) 文本块  q 0.000 g 0 Tr BT <x> <y> Td (Payslip generate by) Tj ET Q
    2) Logo块  q <a> 0 0 <d> <e> <y> cm /Iₙ Do Q
  两者共享同一个 y 坐标（例如 -6.165）— 这是模板的指纹。
  做法：先用水印短语锁定文本块、抠出它的 y；再扫描其他 q…Q 块，凡是
  `<...> <y> cm /X Do` 的图像绘制块且 y 与文本块匹配 → 一并删除。
  其余字节原封不动。

文件命名：Z004BSBU-nguyen-hoang-tien_payslip_for_Mar-2026.pdf
       →  Z004BSBU_202603.pdf

写回页面 /Contents 时必须把新 stream 作为 *间接对象* 添加到 writer 对象池，
否则 pypdf 会把它内联进 page dict（`/Contents << /Length N >> stream …`），
大多数 PDF 阅读器都无法正确渲染这种结构。
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Iterator
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, NameObject
from .base import TaskBase, TaskEvent
from ..ipc import LogEvent, ProgressEvent

# 文件名格式：<code>-<slug>_payslip_for_<Mon>-<YYYY>.pdf
# 扩展名大小写不敏感（.pdf / .PDF / .Pdf 都接受），其余部分保持严格大小写。
FILENAME_RE = re.compile(
    r"^(?P<code>[A-Z0-9]+)-(?P<slug>[a-z0-9\-]+)"
    r"_payslip_for_(?P<mon>[A-Z][a-z]{2})-(?P<year>\d{4})\.(?i:pdf)$"
)
MONTHS = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12",
}
_WM_PHRASE = "Payslip generate by"
WATERMARK_PATTERNS = (
    _WM_PHRASE.encode("ascii"),
    _WM_PHRASE.encode("utf-16be"),
    _WM_PHRASE.encode("utf-16le"),
)

# 文本块 Td 操作的 Y 操作数：`BT <tx> <ty> Td`
_TD_Y_RE = re.compile(rb"BT\s+-?[\d.]+\s+(-?[\d.]+)\s+Td")
# `q … Q` 图形块（非贪婪，取最内层）
_QQ_RE = re.compile(rb"\bq\b.*?\bQ\b", re.DOTALL)


def _read_content_bytes(page) -> bytes:
    """读取页面内容流的解码字节，兼容单流与多流数组两种形式。"""
    if "/Contents" not in page:
        return b""
    obj = page["/Contents"]
    if hasattr(obj, "get_object"):
        obj = obj.get_object()
    if isinstance(obj, ArrayObject):
        parts: list[bytes] = []
        for ref in obj:
            inner = ref.get_object() if hasattr(ref, "get_object") else ref
            parts.append(inner.get_data())
        return b"".join(parts)
    return obj.get_data()


def _strip_watermark_blocks(data: bytes) -> tuple[bytes, bool]:
    """精准删除水印文本块及同 y 坐标的 logo 图像块。

    返回 (新字节流, 是否删除过任何块)。其余字节保持原样。
    """
    blocks = list(_QQ_RE.finditer(data))
    drop_indices: set[int] = set()
    wm_y: bytes | None = None

    # Pass 1: 定位水印文本块，抠出它的 y 坐标
    for i, m in enumerate(blocks):
        block = m.group(0)
        if any(p in block for p in WATERMARK_PATTERNS):
            drop_indices.add(i)
            td = _TD_Y_RE.search(block)
            if td:
                wm_y = td.group(1)

    # Pass 2: 找共享同一 y 坐标的 logo 块（`<a> <b> <c> <d> <e> <y> cm /X Do`）
    if wm_y is not None:
        cm_do_re = re.compile(
            rb"-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+"
            + re.escape(wm_y)
            + rb"\s+cm\s+/\w+\s+Do"
        )
        for i, m in enumerate(blocks):
            if i in drop_indices:
                continue
            if cm_do_re.search(m.group(0)):
                drop_indices.add(i)

    if not drop_indices:
        return data, False

    out = bytearray()
    last = 0
    for i, m in enumerate(blocks):
        if i in drop_indices:
            out.extend(data[last:m.start()])
            last = m.end()
    out.extend(data[last:])
    return bytes(out), True


def _clean_page(page, writer: PdfWriter) -> bool:
    existing = _read_content_bytes(page)
    stripped, dropped = _strip_watermark_blocks(existing)
    if not dropped:
        return False

    new_stream = DecodedStreamObject()
    new_stream.set_data(stripped)
    indirect = writer._add_object(new_stream)
    page[NameObject("/Contents")] = indirect
    return True


def clean_pdf(src: Path, dst: Path) -> bool:
    """处理单个 PDF，返回是否检测到并移除了水印块。"""
    reader = PdfReader(str(src))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    any_dropped = False
    for page in writer.pages:
        if _clean_page(page, writer):
            any_dropped = True
    with open(dst, "wb") as fh:
        writer.write(fh)
    return any_dropped


def parse_filename(name: str) -> dict | None:
    """解析输入文件名，返回 {code, slug, period_num, new_name} 或 None。"""
    m = FILENAME_RE.match(name)
    if not m:
        return None
    month = MONTHS.get(m.group("mon"))
    if not month:
        return None
    year = m.group("year")
    code = m.group("code")
    return {
        "code": code,
        "slug": m.group("slug"),
        "mon": m.group("mon"),
        "year": year,
        "period_num": f"{year}{month}",
        "new_name": f"{code}_{year}{month}.pdf",
    }


class VaVnPayslipTask(TaskBase):
    task_id = "va-vn-payslip-rename"
    code    = "VA-VN-PAYSLIP-RENAME"
    name    = "瓦里安越南 Payslip 重命名并去水印"
    desc    = "按 {code}_{YYYYMM}.pdf 重命名 · 清除底部水印"
    inputs  = ["folder"]

    def run(self, *, input_path: Path, output_dir: Path, options: dict) -> Iterator[TaskEvent]:
        if input_path.is_file():
            files = [input_path] if input_path.suffix.lower() == ".pdf" else []
        else:
            # 用 iterdir + suffix.lower() 而非 glob('*.pdf') — 后者大小写敏感，
            # 在大小写不敏感的文件系统上仍会漏掉 .PDF / .Pdf。
            files = sorted(
                p for p in input_path.iterdir()
                if p.is_file() and p.suffix.lower() == ".pdf"
            )

        yield LogEvent(f"扫描 {input_path}：发现 {len(files)} 个 PDF")
        if not files:
            yield LogEvent("无可处理的 PDF", lvl="warn")
            return

        total = len(files)
        ok = 0
        for i, src in enumerate(files):
            meta = parse_filename(src.name)
            if not meta:
                yield LogEvent(f"跳过 {src.name}：命名不匹配", lvl="warn")
                yield ProgressEvent(done=i + 1, total=total, note="")
                continue
            dst = output_dir / meta["new_name"]
            yield ProgressEvent(done=i, total=total, note=meta["code"])
            try:
                dropped = clean_pdf(src, dst)
            except Exception as e:  # noqa: BLE001
                yield LogEvent(f"{src.name} 处理失败：{e}", lvl="err")
                yield ProgressEvent(done=i + 1, total=total, note="")
                continue
            if not dropped:
                yield LogEvent(f"{src.name}：未检测到水印（已直接复制）", lvl="warn")
            ok += 1
            yield LogEvent(f"{src.name} → {meta['new_name']}", lvl="ok")
            yield str(dst)
            yield ProgressEvent(done=i + 1, total=total, note=meta["code"])

        yield LogEvent(f"完成 {ok}/{total}", lvl="ok" if ok == total else "warn")
