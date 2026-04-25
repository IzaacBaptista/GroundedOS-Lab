#!/usr/bin/env python3
"""Distillation experiment runner — real distillation if PyTorch is available."""

from pathlib import Path
import sys

try:
    import torch
    from transformers import AutoModelForCausalLM

    sys.path.insert(0, str(Path(__file__).resolve().parents[0]))
    from run_experiment_real import main

    if __name__ == "__main__":
        raise SystemExit(main())

except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from phase5_scaffold import main

    if __name__ == "__main__":
        raise SystemExit(main(["distillation", *sys.argv[1:]]))
