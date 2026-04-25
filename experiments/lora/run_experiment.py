#!/usr/bin/env python3
"""LoRA experiment runner - uses real training if PyTorch is available, falls back to scaffold."""

from pathlib import Path
import sys

# Try to run real LoRA training
try:
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM
    
    # PyTorch available - run real training
    sys.path.insert(0, str(Path(__file__).resolve().parents[0]))
    from run_experiment_real import main
    
    if __name__ == "__main__":
        raise SystemExit(main())

except ImportError:
    # Fallback to scaffold
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from phase5_scaffold import main

    if __name__ == "__main__":
        raise SystemExit(main(["lora", *sys.argv[1:]]))
