import re
from typing import List, Dict


_CODE_BLOCK_RE = re.compile(r"```(\w+)?\n([\s\S]*?)```", re.MULTILINE)


def extract_code_blocks(text: str) -> List[Dict[str, str]]:
    blocks = []
    for match in _CODE_BLOCK_RE.finditer(text):
        language = match.group(1) or ""
        code = match.group(2)
        blocks.append({"language": language, "code": code})
    return blocks
