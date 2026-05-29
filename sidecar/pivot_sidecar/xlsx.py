"""Excel 输入校验 + 统一打开。

把「打开一个 xlsx」收敛到一处：对各种坏输入抛出 ExcelError（中文、面向用户），
由 server 统一翻译成红色错误提示。明文 xlsx 与 msoffcrypto 加密 xlsx 都支持。
"""
from __future__ import annotations
import io
import zipfile
from pathlib import Path

import msoffcrypto
import openpyxl
from msoffcrypto.exceptions import FileFormatError, InvalidKeyError
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.workbook import Workbook


class ExcelError(Exception):
    """面向用户的 Excel 输入校验错误（中文消息）。"""


def open_xlsx(
    path,
    *,
    password: str | None = None,
    data_only: bool = False,
    read_only: bool = False,
) -> Workbook:
    """打开 xlsx（自动处理 msoffcrypto 加密），坏输入抛 ExcelError。

    明文与加密文件都支持：加密文件需提供 password，密码错误会给出明确提示。
    """
    p = Path(path)
    name = p.name

    # 1. 判别是否 Office 文件 / 是否加密；非 Office（改名的 txt、损坏文件）→ FileFormatError
    try:
        with open(p, "rb") as fh:
            office = msoffcrypto.OfficeFile(fh)
            if office.is_encrypted():
                if not password:
                    raise ExcelError(f"文件「{name}」已加密，但未提供密码")
                office.load_key(password=password)
                buf = io.BytesIO()
                try:
                    office.decrypt(buf)
                except InvalidKeyError:
                    raise ExcelError(f"文件「{name}」密码错误，无法解密")
                buf.seek(0)
                source = buf
            else:
                source = None  # 明文：交给 openpyxl 直接读路径
    except FileFormatError:
        raise ExcelError(f"文件「{name}」不是有效的 Excel 文件（格式无法识别）")

    # 2. openpyxl 解析；损坏 zip / 非 xlsx → BadZipFile / InvalidFileException
    try:
        return openpyxl.load_workbook(
            source if source is not None else p,
            data_only=data_only,
            read_only=read_only,
        )
    except (zipfile.BadZipFile, InvalidFileException):
        raise ExcelError(f"文件「{name}」已损坏或不是有效的 xlsx 文件")
