$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
Push-Location $project
try {
  python -m venv --system-site-packages .runtime/birefnet-venv
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python environment' }
  $python = Join-Path $project '.runtime/birefnet-venv/Scripts/python.exe'
  & $python -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
  if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed' }
  & $python -m pip install transformers==4.48.3 timm==1.0.31 kornia==0.9.1 einops==0.8.2
  if ($LASTEXITCODE -ne 0) { throw 'BiRefNet dependencies installation failed' }
  & $python -c "from huggingface_hub import snapshot_download; from pathlib import Path; rev='e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4'; snapshot_download('ZhengPeng7/BiRefNet',revision=rev,local_dir='.runtime/birefnet-model',allow_patterns=['*.py','*.json','*.safetensors','LICENSE','README.md']); Path('.runtime/birefnet-model/revision.txt').write_text(rev)"
  if ($LASTEXITCODE -ne 0) { throw 'Model download failed' }
  & $python -c "import torch; assert torch.cuda.is_available(), 'CUDA unavailable'; print(torch.__version__, torch.cuda.get_device_name(0))"
  if ($LASTEXITCODE -ne 0) { throw 'GPU verification failed' }
} finally { Pop-Location }
