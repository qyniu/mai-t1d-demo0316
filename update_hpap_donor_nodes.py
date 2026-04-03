#!/usr/bin/env python3
"""
Regenerate HPAP donor nodes from the Excel inventory and sync them into KG files.

Default behavior:
- Read `NC_HPAP Data Inventory.xlsx`
- Parse `Sheet3`
- Rebuild `src/hpapDonorNodes.js` (HPAP-001..HPAP-193)
- Ensure `src/graphData.js` imports and spreads `HPAP_DONOR_NODES`

Usage:
  python update_hpap_donor_nodes.py
  python update_hpap_donor_nodes.py --sheet Sheet3 --max-donor 193
  python update_hpap_donor_nodes.py --skip-graphdata
"""

from __future__ import annotations

import argparse
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List, Tuple


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update HPAP donor nodes from Excel.")
    parser.add_argument(
        "--xlsx",
        default="NC_HPAP Data Inventory.xlsx",
        help="Path to Excel inventory (.xlsx). Default: NC_HPAP Data Inventory.xlsx",
    )
    parser.add_argument(
        "--sheet",
        default="Sheet3",
        help="Worksheet name containing donor rows. Default: Sheet3",
    )
    parser.add_argument(
        "--min-donor",
        type=int,
        default=1,
        help="Minimum donor index (HPAP-XXX). Default: 1",
    )
    parser.add_argument(
        "--max-donor",
        type=int,
        default=193,
        help="Maximum donor index (HPAP-XXX). Default: 193",
    )
    parser.add_argument(
        "--nodes-out",
        default="src/hpapDonorNodes.js",
        help="Output JS module for donor nodes. Default: src/hpapDonorNodes.js",
    )
    parser.add_argument(
        "--graph-data",
        default="src/graphData.js",
        help="graphData.js path to ensure import/spread wiring. Default: src/graphData.js",
    )
    parser.add_argument(
        "--skip-graphdata",
        action="store_true",
        help="Only regenerate donor node module; do not edit graphData.js.",
    )
    return parser.parse_args()


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n


def read_shared_strings(zf: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    shared: List[str] = []
    for si in root.findall("a:si", NS):
        shared.append("".join(t.text or "" for t in si.findall(".//a:t", NS)))
    return shared


def cell_value(cell: ET.Element, shared: List[str]) -> str:
    ctype = cell.attrib.get("t")
    value = cell.find("a:v", NS)

    if ctype == "inlineStr":
        inline = cell.find("a:is", NS)
        if inline is None:
            return ""
        return "".join(t.text or "" for t in inline.findall(".//a:t", NS))

    if value is None:
        return ""

    raw = value.text or ""
    if ctype == "s":
        try:
            return shared[int(raw)]
        except Exception:
            return raw
    return raw


def load_sheet_rows(xlsx_path: Path, sheet_name: str) -> Tuple[List[str], List[Dict[int, str]]]:
    with zipfile.ZipFile(xlsx_path) as zf:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            r.attrib["Id"]: r.attrib["Target"]
            for r in rels.findall(
                "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
            )
        }

        sheet_target = None
        for sheet in workbook.findall("a:sheets/a:sheet", NS):
            if sheet.attrib["name"] == sheet_name:
                rid = sheet.attrib[
                    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
                ]
                sheet_target = rel_map[rid]
                break
        if sheet_target is None:
            names = [s.attrib["name"] for s in workbook.findall("a:sheets/a:sheet", NS)]
            raise ValueError(f"Sheet '{sheet_name}' not found. Available: {names}")

        if not sheet_target.startswith("worksheets/"):
            sheet_target = "worksheets/" + sheet_target.split("worksheets/")[-1]
        sheet_path = "xl/" + sheet_target

        shared = read_shared_strings(zf)
        root = ET.fromstring(zf.read(sheet_path))
        rows = root.findall(".//a:sheetData/a:row", NS)

        parsed_rows: List[Dict[int, str]] = []
        for row in rows:
            row_data: Dict[int, str] = {}
            for cell in row.findall("a:c", NS):
                row_data[col_index(cell.attrib.get("r", "A1"))] = cell_value(cell, shared)
            parsed_rows.append(row_data)

    if not parsed_rows:
        raise ValueError(f"Sheet '{sheet_name}' is empty.")

    max_col = max((max(r.keys()) if r else 0) for r in parsed_rows)
    raw_headers = [(parsed_rows[0].get(i, "") or "").strip() for i in range(1, max_col + 1)]
    return raw_headers, parsed_rows[1:]


def make_unique_headers(raw_headers: List[str]) -> List[str]:
    seen: Dict[str, int] = {}
    headers: List[str] = []
    for idx, header in enumerate(raw_headers, start=1):
        key = header if header else f"column_{idx}"
        count = seen.get(key, 0) + 1
        seen[key] = count
        if count == 1:
            headers.append(key)
        else:
            headers.append(f"{key}__{count}")
    return headers


def build_nodes(
    headers: List[str],
    data_rows: List[Dict[int, str]],
    min_donor: int,
    max_donor: int,
) -> Tuple[List[Dict[str, object]], List[str]]:
    try:
        donor_col = headers.index("donor_ID") + 1
    except ValueError as exc:
        raise ValueError("Column 'donor_ID' not found in target sheet.") from exc

    by_donor: Dict[str, Dict[str, str]] = {}
    for row in data_rows:
        donor = (row.get(donor_col, "") or "").strip()
        if not donor:
            continue
        detail: Dict[str, str] = {}
        for idx, key in enumerate(headers, start=1):
            detail[key] = (row.get(idx, "") or "").strip()
        by_donor[donor] = detail

    nodes: List[Dict[str, object]] = []
    missing: List[str] = []
    for num in range(min_donor, max_donor + 1):
        donor = f"HPAP-{num:03d}"
        detail = by_donor.get(donor)
        if detail is None:
            detail = {k: "" for k in headers}
            detail["donor_ID"] = donor
            missing.append(donor)
        node = {
            "id": f"donor_{donor.lower().replace('-', '_')}",
            "label": donor,
            "type": "RawData",
            "detail": detail,
        }
        nodes.append(node)
    return nodes, missing


def write_nodes_module(nodes_out: Path, nodes: List[Dict[str, object]]) -> None:
    body = json.dumps(nodes, ensure_ascii=False, indent=2)
    content = f"export const HPAP_DONOR_NODES = {body};\n"
    nodes_out.parent.mkdir(parents=True, exist_ok=True)
    nodes_out.write_text(content, encoding="utf-8")


def find_nodes_array_close_index(graph_data: str) -> int:
    marker = "export const NODES = ["
    start = graph_data.find(marker)
    if start < 0:
        raise ValueError("Could not locate 'export const NODES = [' in graphData.js")

    i = start + len(marker)
    depth = 1
    in_string = False
    string_ch = ""
    escaped = False

    while i < len(graph_data):
        ch = graph_data[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == string_ch:
                in_string = False
        else:
            if ch in ("'", '"', "`"):
                in_string = True
                string_ch = ch
            elif ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    return i
        i += 1

    raise ValueError("Failed to find closing bracket for NODES array.")


def ensure_graphdata_wiring(graph_data_path: Path) -> None:
    content = graph_data_path.read_text(encoding="utf-8")
    import_line = 'import { HPAP_DONOR_NODES } from "./hpapDonorNodes";'

    if import_line not in content:
        content = import_line + "\n\n" + content

    if "...HPAP_DONOR_NODES" not in content:
        close_idx = find_nodes_array_close_index(content)
        insertion = "\n  ...HPAP_DONOR_NODES,\n"
        content = content[:close_idx] + insertion + content[close_idx:]

    graph_data_path.write_text(content, encoding="utf-8")


def main() -> None:
    args = parse_args()
    xlsx_path = Path(args.xlsx)
    nodes_out = Path(args.nodes_out)
    graph_data_path = Path(args.graph_data)

    if not xlsx_path.exists():
        raise FileNotFoundError(f"Excel file not found: {xlsx_path}")

    raw_headers, data_rows = load_sheet_rows(xlsx_path, args.sheet)
    headers = make_unique_headers(raw_headers)
    nodes, missing = build_nodes(headers, data_rows, args.min_donor, args.max_donor)
    write_nodes_module(nodes_out, nodes)

    if not args.skip_graphdata:
        if not graph_data_path.exists():
            raise FileNotFoundError(f"graphData.js not found: {graph_data_path}")
        ensure_graphdata_wiring(graph_data_path)

    print(f"Updated: {nodes_out} ({len(nodes)} donor nodes)")
    print(f"Headers captured: {len(headers)}")
    if missing:
        print(f"Missing donor rows in sheet (filled with empty detail): {missing}")
    else:
        print("No missing donor rows in configured donor range.")


if __name__ == "__main__":
    main()

