#!/usr/bin/env python3
"""Fine-tuning experiment runner — real SFT if PyTorch is available, else scaffold."""

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
        raise SystemExit(main(["fine-tuning", *sys.argv[1:]]))
