import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProvenanceRecorder:
    """Lightweight event recorder for pipeline/training provenance."""

    def __init__(self, base_dir: Optional[Path] = None):
        root = Path(base_dir) if base_dir else Path.cwd()
        self.base_dir = root
        self.out_dir = root / "demo_outputs"
        self.out_dir.mkdir(exist_ok=True)
        self.events_path = self.out_dir / "events.jsonl"

    def capture_event(self, event_type: str, payload: Dict) -> Dict:
        event = {
            "event_id": f"evt_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
            "event_type": event_type,
            "agent": os.environ.get("USER") or os.environ.get("USERNAME", "unknown"),
            "timestamp": _utc_now(),
            "payload": payload,
        }
        with open(self.events_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event

    def reset_events(self) -> None:
        if self.events_path.exists():
            self.events_path.unlink()

    def load_events(self) -> List[Dict]:
        if not self.events_path.exists():
            return []
        rows: List[Dict] = []
        with open(self.events_path, "r", encoding="utf-8") as f:
            for line in f:
                text = line.strip()
                if text:
                    rows.append(json.loads(text))
        return rows


def _node(nodes: Dict[str, Dict], node_id: str, node_type: str, attrs: Dict) -> None:
    if node_id not in nodes:
        nodes[node_id] = {"id": node_id, "type": node_type, **attrs}
    else:
        for k, v in attrs.items():
            if k not in nodes[node_id] or nodes[node_id][k] in (None, "", []):
                nodes[node_id][k] = v


def _edge(edges: List[Dict], source: str, relation: str, target: str, attrs: Optional[Dict] = None) -> None:
    rec = {"source": source, "relation": relation, "target": target}
    if attrs:
        rec.update(attrs)
    if rec not in edges:
        edges.append(rec)


def _normalize_artifact(artifact: Dict) -> Dict:
    artifact_type = artifact.get("artifact_type", "dataset").lower()
    if artifact_type == "metadata":
        raw_id = artifact.get("metadata_id") or artifact.get("dataset_id") or artifact.get("id")
        return {"node_id": f"metadata:{raw_id}", "node_type": "Metadata", "version": artifact.get("version")}
    raw_id = artifact.get("dataset_id") or artifact.get("id")
    return {"node_id": f"dataset:{raw_id}", "node_type": "IntermediateDataset", "version": artifact.get("version")}


def build_knowledge_graph(events: List[Dict], out_dir: Path) -> Dict:
    nodes: Dict[str, Dict] = {}
    edges: List[Dict] = []

    for event in events:
        et = event["event_type"]
        payload = event["payload"]
        agent = event["agent"]
        ts = event["timestamp"]

        agent_id = f"agent:{agent}"
        _node(nodes, agent_id, "Agent", {"name": agent})

        if et == "pipeline_run":
            pipeline_id = f"pipeline:{payload['pipeline_id']}"
            out_ds = payload["output_dataset"]
            out_meta = payload["output_metadata"]

            _node(nodes, pipeline_id, "Pipeline", {
                "version": payload.get("pipeline_version"),
                "key_filters": payload.get("key_filters", []),
                "run_id": payload.get("run_id"),
                "timestamp": ts,
            })
            _edge(edges, pipeline_id, "WAS_ATTRIBUTED_TO", agent_id)

            for inp in payload.get("inputs", []):
                data_id = f"dataset:{inp['dataset_id']}"
                _node(nodes, data_id, "RawData", {
                    "version": inp.get("version"),
                    "role": inp.get("role", "upstream_input"),
                })
                _edge(edges, pipeline_id, "USED", data_id)

            out_ds_id = f"dataset:{out_ds['dataset_id']}"
            _node(nodes, out_ds_id, "IntermediateDataset", {
                "version": out_ds.get("version"),
                "stage": "QC/AI-ready",
            })
            _edge(edges, out_ds_id, "WAS_GENERATED_BY", pipeline_id)
            for inp in payload.get("inputs", []):
                _edge(edges, out_ds_id, "WAS_DERIVED_FROM", f"dataset:{inp['dataset_id']}")

            out_meta_id = f"metadata:{out_meta['metadata_id']}"
            _node(nodes, out_meta_id, "Metadata", {
                "version": out_meta.get("version"),
                "fields": out_meta.get("fields", []),
            })
            _edge(edges, out_meta_id, "WAS_GENERATED_BY", pipeline_id)
            _edge(edges, out_meta_id, "LINKED_TO", out_ds_id)

            if payload.get("dataset_card"):
                card = payload["dataset_card"]
                card_id = f"dataset_card:{card['card_id']}"
                _node(nodes, card_id, "DatasetCard", {
                    "version": card.get("version"),
                    "owner": card.get("owner"),
                })
                _edge(edges, out_ds_id, "WAS_DOCUMENTED_BY", card_id)

        if et == "training_run":
            train_id = f"training:{payload['run_id']}"
            model = payload["model"]
            model_id = f"model:{model['model_id']}"

            _node(nodes, train_id, "TrainingActivity", {
                "timestamp": ts,
                "framework": payload.get("framework"),
            })
            _edge(edges, train_id, "WAS_ATTRIBUTED_TO", agent_id)

            _node(nodes, model_id, "Model", {
                "architecture": model.get("architecture"),
                "version": model.get("version"),
            })
            _edge(edges, model_id, "WAS_GENERATED_BY", train_id)

            train_ds = payload.get("training_data", [])
            eval_ds = payload.get("evaluation_data", [])
            for d in train_ds:
                norm = _normalize_artifact(d)
                _node(nodes, norm["node_id"], norm["node_type"], {"version": norm.get("version")})
                _edge(edges, train_id, "USED", norm["node_id"], {"usage": "training"})
                _edge(edges, model_id, "WAS_DERIVED_FROM", norm["node_id"])

            for d in eval_ds:
                norm = _normalize_artifact(d)
                _node(nodes, norm["node_id"], norm["node_type"], {"version": norm.get("version")})
                _edge(edges, train_id, "USED", norm["node_id"], {"usage": "evaluation"})

            metric_node_id = f"metrics:{payload['run_id']}"
            _node(nodes, metric_node_id, "EvaluationMetrics", {
                "metrics": payload.get("metrics", {}),
            })
            _edge(edges, metric_node_id, "WAS_GENERATED_BY", train_id)
            _edge(edges, metric_node_id, "LINKED_TO", model_id)

            if payload.get("model_card"):
                card = payload["model_card"]
                card_id = f"model_card:{card['card_id']}"
                _node(nodes, card_id, "ModelCard", {
                    "version": card.get("version"),
                    "owner": card.get("owner"),
                })
                _edge(edges, model_id, "WAS_DOCUMENTED_BY", card_id)

    graph = {
        "generated_at": _utc_now(),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "nodes": list(nodes.values()),
        "edges": edges,
    }

    out_dir.mkdir(exist_ok=True)
    with open(out_dir / "kg_graph.json", "w", encoding="utf-8") as f:
        json.dump(graph, f, indent=2, ensure_ascii=False)

    return graph


def write_kg_summary(graph: Dict, out_dir: Path) -> Path:
    lines = [
        "# MAI-T1D Knowledge Graph Summary",
        "",
        f"- Generated at: {graph['generated_at']}",
        f"- Nodes: {graph['node_count']}",
        f"- Edges: {graph['edge_count']}",
        "",
        "## Node Types",
    ]

    type_count: Dict[str, int] = {}
    for n in graph["nodes"]:
        t = n.get("type", "Unknown")
        type_count[t] = type_count.get(t, 0) + 1
    for t, c in sorted(type_count.items()):
        lines.append(f"- {t}: {c}")

    lines.extend(["", "## Edge Types"])
    edge_count: Dict[str, int] = {}
    for e in graph["edges"]:
        r = e["relation"]
        edge_count[r] = edge_count.get(r, 0) + 1
    for r, c in sorted(edge_count.items()):
        lines.append(f"- {r}: {c}")

    out_path = out_dir / "kg_summary.md"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return out_path
